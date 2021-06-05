import numpy as np
import pandas as pd
import nltk
import re
import os
import PyPDF2
import docx #install python-docx
from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import KMeans
from flask import Flask, request
import json
app = Flask(__name__)
import plotly.express as px #plotly version should be above 4.5

nltk.download('averaged_perceptron_tagger')
nltk.download('wordnet')
nltk.download('maxent_ne_chunker')
nltk.download('words')
# init_notebook_mode()
# pd.set_option('display.max_columns',15)

from pymongo import MongoClient
import gridfs

client = MongoClient()
db = client.androidKmeans
fs = gridfs.GridFS(db, 'documents')

def read_pdf(doc_name):
    pdfFileObj = open(doc_name, 'rb')
    pdfReader = PyPDF2.PdfFileReader(pdfFileObj, strict=False) 
    pdf_text=''
    if(pdfReader.getNumPages()>30):
        n=30
    else:
        n=pdfReader.getNumPages()
    for i in range(0,n):
        pdf_text+=pdfReader.getPage(i).extractText()     
    pdfFileObj.close()
    return pdf_text

def read_txt(doc_name):
    f1=open(doc_name,'r+',encoding="utf8")
    fullText=f1.readlines()
    f1.close()
    txt_text='\n'.join(fullText)
    return txt_text

def read_docx(doc_name):
    doc = docx.Document(doc_name)
    fullText = []
    for para in doc.paragraphs:
        fullText.append(para.text)
    docx_text='\n'.join(fullText)
    return docx_text

dictoftexts={}
for docs in fs.find():
    name = docs.metadata
    ff = open(name, 'wb')
    ff.write(docs.read())
    ff.close()
    # ff = open(name, 'rb')
    if(name.split('.')[-1]=='pdf'):
        dictoftexts[name]=read_pdf(name)
    elif(name.split('.')[-1]=='txt'):
        dictoftexts[name]=read_txt(name)
    elif(name.split('.')[-1]=='docx'):
        dictoftexts[name]=read_docx(name)
    # ff.close()
     
data1=pd.DataFrame(dictoftexts.items(),columns=['Name','Text'])
# data1.info()

#Tokenization
data1['Tokens'] = data1['Text'].apply(lambda x: nltk.word_tokenize(x))

#Lemmatization, cleaning the text
lemmatizer = nltk.stem.WordNetLemmatizer()
non_alphanum = re.compile('[^0-9a-zA-Z]')
listofwordstoclean=['come','could','get','know','like','look','let','make','may','might','oget','ous','put','say','see','try','thing','take','tell','want','would','ask','around','abc','amb','back','behind','didnt','dont','eye','face','find','give','hear','hand','much','maybe','one','time','think','two','wasnt','wait','yes']
items_to_clean = set(nltk.corpus.stopwords.words('english') + ['\n','\n\n','\n\n\n','\n\n\n\n','',' ']+listofwordstoclean)

def clean_text(tokens):
    index=0
    cleaned_list = []
    for word, tag in nltk.pos_tag(tokens):
        word = non_alphanum.sub('', word)
        word = word.lower()
        wntag = tag[0].lower()
        wntag = wntag if wntag in ['a', 'r', 'n', 'v'] else None
        if not wntag:
            word = word
        else:
            word = lemmatizer.lemmatize(word, wntag)
        if len(word) < 3: 
            word = ''
        tokens[index] = word
        cleaned_list = [elem for elem in tokens if elem not in items_to_clean]
        index+=1
    return cleaned_list


data1['cleaned_tokens'] = data1['Tokens'].apply(lambda x: clean_text(x))

#Frequency distribtuion of words in the document
data1['freq_distribution'] = data1['cleaned_tokens'].apply(lambda x:nltk.FreqDist(x))

#Remove frequent words
def remove_freq_words(tokens,percentage):    
    threshold = int(len(tokens) * percentage / 100)
    dictoftokens = defaultdict(int)
    for word in tokens:
        dictoftokens[word] += 1
    words_to_remove = {k:v for k,v in dictoftokens.items() if v > threshold }
    words_to_remove_as_list = set(words_to_remove.keys())
    freq_items_removed_list = [word for word in tokens if word not in words_to_remove_as_list]
    return freq_items_removed_list

data1['cleaned_tokens_without_freqwords'] = data1['cleaned_tokens'].apply(lambda x:remove_freq_words(x,70))

#Convert To String
def convert_to_str(tokens):
    content_str=' '.join(tokens)
    return content_str

data1['cleaned_tokens_string'] = data1['cleaned_tokens_without_freqwords'].apply(lambda x:convert_to_str(x))


#TfidfVectorizer
#Calculate similarity: generate the cosine similarity matrix using 
#the tf-idf matrix (100x100), then generate the distance 
#matrix (1 - similarity matrix), so each pair of synopsis has a 
#distance number between 0 and 1
tfidf_vectorizer = TfidfVectorizer()
tfidf_matrix = tfidf_vectorizer.fit_transform(list(data1['cleaned_tokens_string']))
similarity_matrix = cosine_similarity(tfidf_matrix)
tfidf_matrix.todense()
pd.DataFrame(tfidf_matrix.todense())

#KMeans Clustering
km = KMeans(n_clusters = 5,random_state=5)
km.fit(tfidf_matrix)
cluster_list = km.labels_.tolist()
# print(cluster_list)
# print(data1['Name'])

#Top Keywords in the clusters
def get_top_keywords(data, clusters, labels, n_terms):
    d1=data.todense()
    d2 = pd.DataFrame(d1)
    d3=d2.groupby(clusters).mean()
    topwords=[]
    for i,r in d3.iterrows():
        topwords.append(','.join([labels[t] for t in np.argsort(r)[-n_terms:]]))
    return topwords
    
topwords=get_top_keywords(tfidf_matrix, km.labels_, tfidf_vectorizer.get_feature_names(), 100)

#Get the cluster by searching the term
def searchterm(search_term):
    index=0
    cluster_index = index
    for t in topwords:
        if(t.find(search_term)>0):
            cluster_index=index
        index+=1
    listofindices=[]
    labels = []
    for i in range(0,len(cluster_list)):
        if(cluster_list[i]==cluster_index):
            listofindices.append(i)
            labels.append(cluster_list[i])
    # df = pd.DataFrame(columns=['Name', 'Cluster_Labels'])
    # df['Name'] = data1.iloc[listofindices]['Name']
    # df['Cluster_Labels'] = labels
    return data1.iloc[listofindices]['Name'].tolist(), labels


# listen to requests in /search path
@app.route('/search')
def hello():
    tag = request.args.get('search')
    # initiate data with dummy vals;
    data = json.dumps({'cluster_data' : "no tags", "all_data": "no tag"})
    if tag:
        # if tag is present fetch the names and the cluster
        names, labels = searchterm(tag)
        print(tag, names, labels)
        if name and len(name) > 0 and labels and len(labels) > 0:
            # rebuild the data got from function searchterm
            data = json.dumps({'names': names, 'labels': labels})
            # data = json.dumps({'cluster_data' : cluster_info.tolist(), "all_data": data2.tolist()})
            # data = json.dumps({'cluster_data' : cluster_info.to_json(), "all_data": data2.to_json()})
    return data

# listen to this port
if __name__ == '__main__':
    app.run(port="8238")