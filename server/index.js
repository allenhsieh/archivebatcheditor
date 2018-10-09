var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var config = require('../config');
var updateUrl = 'https://archive.org/advancedsearch.php?q=allenh100%40gmail.com&fl%5B%5D=identifier&fl%5B%5D=title&sort%5B%5D=addeddate+desc&sort%5B%5D=&sort%5B%5D=&rows=9999&page=1&output=json';
var rp = require('request-promise-native');
var axios = require('axios');

// UNCOMMENT THE DATABASE YOU'D LIKE TO USE
// var items = require('../database-mysql');
var db = require('../database-mongo');

var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// UNCOMMENT FOR REACT
app.use(express.static(__dirname + '/../react-client/dist'));

app.post('/data', (req, res) => {
  const archiveURL = 'https://archive.org/metadata/';
  const log = req.body.endpoints.map( endpoint => {
    let options = {
      url: archiveURL + endpoint,
      form: {
        '-target': 'metadata',
        '-patch': JSON.stringify(req.body.query),
        'access': config.acc,
        'secret': config.pass
      },
      json: true
    }
    return rp
    .post(options)
    .then(res => {
      res.identifier = endpoint;
      return res;
    })
    .catch(err => {
      err.error.identifier = endpoint;
      return err.error;
    });
  });

  Promise.all(log).then(logArray=> {
    console.log('LOG ARRAY', logArray)
    res.status(200).send(logArray);
  });
});

app.post('/search', (req, res) => {
  db.search(req.body.q, (results) => {
    res.json({results});
  });
});

app.get('/updateDB', (req, res) => {
  let options= {
    url: updateUrl,
    json: true,
  }
  request(options, (err, response, body) => {
    db.updateDB(body.response.docs, (msg) => {
      console.log('SERVER MSG', msg);
      res.status(200).send(msg);
    });
  })
});

app.listen(3000, function() {
  console.log('listening on port 3000!');
});

