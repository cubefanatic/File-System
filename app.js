const express = require("express");
const user = require('./routes/user');
const app = express();
const request = require('request');
const crypto = require("crypto");
const path = require("path");
const mongoose = require("mongoose");
const session = require('express-session');
const multer = require("multer");
const GridFsStorage = require("multer-gridfs-storage");
app.use(session({secret: "asdjn12io3noi1n4oi3904", resave: false, saveUninitialized: true}));
app.use(express.static(path.join(__dirname, '/public/assets')))
// Middlewares
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.set("view engine", "ejs");

// DB
const mongoURI = "mongodb://127.0.0.1:27017/androidKmeans";

// connection
mongoose.connect(mongoURI, {
  useNewUrlParser: true
});

const conn = mongoose.createConnection(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// init gfs
let gfs;
conn.once("open", () => {
  // init stream
  gfs = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "documents"
  });
});

// Storage
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = buf.toString("hex") + path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: "documents",
          metadata: file.originalname
        };
        resolve(fileInfo);
      });
    });
  }
});

const upload = multer({
  storage
});

// app.post("/login", function (req, res) {
//   let username = req.body.username;
//   let password = req.body.password;
//   let checkUser = User.findOne({username : username, password: password});
//   if(checkUser) {
//     console.log('Correct login');
//     res.send(req);
//   }
//   var user = User({
//     username: username,
//     password: password
//   });
// });

//app.use('/user', user);
// get / page
app.get("/", (req, res) => {
  //if(!req.session.user) {
  //  return res.render('login');
  //}
  if (!gfs) {
    console.log("some error occured, check connection to db");
    res.send("some error occured, check connection to db");
    process.exit(0);
  }
  gfs.find().toArray((err, files) => {
    // check if files
    if (!files || files.length === 0) {
      return res.render("index", {
        files: false
      });
    } else {
      const f = files
        .map(file => {
          if (
            file.contentType === "image/png" ||
            file.contentType === "image/jpeg"
          ) {
            file.isImage = true;
          } else {
            file.isImage = false;
          }
          if (
            file.contentType === "application/pdf"
          ) {
            file.isPDF = true;
          } else {
            file.isPDF = false;
          }
          if (
            file.contentType === "application/msword"
          ) {
            file.isWord = true;
          } else {
            file.isWord = false;
          }
          if (
            file.contentType === "text/plain"
          ) {
            file.isText = true;
          } else {
            file.isText = false;
          }
          if (
            file.contentType === "audio/mpeg3"
          ) {
            file.isMP3 = true;
          } else {
            file.isMP3 = false;
          }
          return file;
        })
        .sort((a, b) => {
          return (
            new Date(b["uploadDate"]).getTime() -
            new Date(a["uploadDate"]).getTime()
          );
        });

      return res.render("index", {
        files: f
      });
    }

    // return res.json(files);
  });
});

app.get('/logout', (req, res) => {
  req.session.user = null;
  return res.redirect('/');
});

// handle search of a tag
app.get("/search", (req, res) => {
  // return if no tahs mentioned
  if(req.query.search === null || req.query.search.length === 0) {
    return res.send("search tag empty");
  }
  // build url for query to get the cluster
  url = "http://127.0.0.1:8238/search?search=" + req.query.search;
  request(url, function (err, response, body) {
    if (err || response.statusCode !== 200) {
      return res.sendStatus(500);
    }
    body = JSON.parse(body);
    gfs.find().toArray((err, files) => {
      // check if files
      if (!files || files.length === 0) {
        return res.render("index", {
          files: false
        });
      } else {
        // build the array containing binary files
        let f = [];
        for(let i = 0; i < files.length; i++) {
          if(body.names.includes(files[i].metadata)) {
            f.push(files[i]);
          }
        }
        body.files = f;
        // render the template
        return res.render('clusters', { data: JSON.stringify(body) });
      }
    });

    // res.render('clusters', {data: JSON.parse(body)});
    // console.log(body);
    // res.render('clusters', {data: JSON.parse(body)});
    // res.render('clusters', { data: body, files: files });
  });
});

app.post("/upload", upload.single("file"), (req, res) => {
  // res.json({file : req.file})
  res.redirect("/");
});

app.get("/files", (req, res) => {
  gfs.find().toArray((err, files) => {
    // check if files
    if (!files || files.length === 0) {
      return res.status(404).json({
        err: "no files exist"
      });
    }

    return res.json(files);
  });
});

app.get("/files/:filename", (req, res) => {
  gfs.find(
    {
      filename: req.params.filename
    },
    (err, file) => {
      if (!file) {
        return res.status(404).json({
          err: "no files exist"
        });
      }

      return res.json(file);
    }
  );
});

app.get("/image/:filename", (req, res) => {
  // console.log('id', req.params.id)
  const file = gfs
    .find({
      filename: req.params.filename
    })
    .toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({
          err: "no files exist"
        });
      }
      gfs.openDownloadStreamByName(req.params.filename).pipe(res);
    });
});

app.get("/pdf/:filename", (req, res) => {
  // console.log('id', req.params.id)
  const file = gfs
    .find({
      filename: req.params.filename
    })
    .toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({
          err: "no files exist"
        });
      }
      gfs.openDownloadStreamByName(req.params.filename).pipe(res);
    });
});

app.get("/msword/:filename", (req, res) => {
  // console.log('id', req.params.id)
  const file = gfs
    .find({
      filename: req.params.filename
    })
    .toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({
          err: "no files exist"
        });
      }
      gfs.openDownloadStreamByName(req.params.filename).pipe(res);
    });
});

app.get("/text/:filename", (req, res) => {
  // console.log('id', req.params.id)
  const file = gfs
    .find({
      filename: req.params.filename
    })
    .toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({
          err: "no files exist"
        });
      }
      gfs.openDownloadStreamByName(req.params.filename).pipe(res);
    });
});

app.get("/audio/:filename", (req, res) => {
  // console.log('id', req.params.id)
  const file = gfs
    .find({
      filename: req.params.filename
    })
    .toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({
          err: "no files exist"
        });
      }
      gfs.openDownloadStreamByName(req.params.filename).pipe(res);
    });
});


// files/del/:id
// Delete chunks from the db
app.post("/files/del/:id", (req, res) => {
  gfs.delete(new mongoose.Types.ObjectId(req.params.id), (err, data) => {
    if (err) return res.status(404).json({ err: err.message });
    res.redirect("/");
  });
});

const port = 5001;

app.listen(port, () => {
  console.log("server started on " + port);
});
