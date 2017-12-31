// URL
const env = {
    main : "http://localhost:8080"
}

// Default app
const bodyParser = require('body-parser')
const passport = require('passport')
const fs = require('fs');
const http = require('http');
const https = require('https');
const Request = require('request');
const express = require('express');
const app = express();
const cors = require('cors')


// SSL
const privateKey = fs.readFileSync('../SSL/privkey.pem').toString();
const certificate = fs.readFileSync('../SSL/fullchain.pem').toString();
const credentials = {key: privateKey, cert: certificate};
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

// APP Setup
app.use(passport.initialize());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors())


// Passport
passport.serializeUser(function(user, done) {
    done(null, user);
});

// Passport bnet
const BnetStrategy = require('passport-bnet').Strategy;
const BNET_ID = '3pvwnysm268hq725f5pmgx5pwp5emwpk'
const BNET_SECRET = 'N3XU7nXKhUEHkAhMCtdxAJTfKxe2CHbV'
passport.use(new BnetStrategy({
    clientID: BNET_ID,
    clientSecret: BNET_SECRET,
    callbackURL: "https://grabkeys.net:3443/bnet/callback"
}, function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
}));


// Mongodb
const MongoClient = require('mongodb').MongoClient
const dbUrl = "mongodb://localhost:27017"
const ObjectId = require('mongodb').ObjectID;


// Route
app.get('/', function(req, res) {
    res.send('Welcome to grabkeys [Overwatch OAuth API]')
})

app.get('/bnet/login',
    passport.authenticate('bnet'));

app.get('/bnet/callback',
    passport.authenticate('bnet', { failureRedirect: '/' }),
    function(req, res){
        
        // change '#' in tag to '-'
        req.user.battletag = req.user.battletag.replace(/#/g, "-")
        
        // use battletag
        let options = {
            url: "http://ow-api.herokuapp.com/profile/pc/global/" + req.user.battletag,
            method: 'GET',
        }
        Request(options, function (error, response, body) {
            // create profile object
            const data = { 
                profile: {
                    permission: 1
                },
                blizzard: {
                    userId : req.user.id,
                    tag : req.user.battletag,
                    token : req.user.token,
                },
                overwatch: JSON.parse(response.body)
            }
            MongoClient.connect(dbUrl, function (err, db) {
                const dbase = db.db('grabkeys-overwatch')
                dbase.collection('users').findOne({ "blizzard.userId" : req.user.id }, function(err, result) {
                    if (result) {   // if not exist --> update token
                        dbase.collection('users').update({ "blizzard.userId" : req.user.id },{ $set: { "blizzard.token" : req.user.token }}, function (err, result) {
                            if (err) throw err;
                            res.redirect(env.main + '?token=' + req.user.token)
                            db.close() 
                        });
                    } else {    // if exist --> insert
                        dbase.collection('users').insertOne(data, function(err, result) {
                            if (err) throw err;
                            res.redirect(env.main + '?token=' + req.user.token)
                            db.close()
                        })
                    }
                });
            });
        });
        
});

app.post('/bnet/get', function (req, res) {
    if (!req.body.token) { res.status(401); res.send('required token field'); } else {
        // find user
        MongoClient.connect(dbUrl, function (err, db) {
            const dbase = db.db('grabkeys-overwatch')
            // dbase.collection('users').find({}).toArray( function (err, result) {
            //     console.log(result)
            // })
            dbase.collection('users').findOne({ "blizzard.token" : req.body.token }, function (err, result) {
                if (err) throw err;
                if (result) {
                    console.log("'" + result.blizzard.tag + "' access with token '" + result.blizzard.token + "'.")
                    res.status(200);
                    res.send(result)
                    db.close()
                } else {
                    // จริงๆคือบางครั้งเวลาของการ update และ find มันพร้อมกันเลยหาไม่เจอ
                    console.log("'" + result.blizzard.tag + "' token '" + req.body.token + "' does not match.")
                    res.status(403);
                    res.send("token does not match.")
                    db.close()
                }
            })
        })
    }
})


httpServer.listen(3030);
httpsServer.listen(3443);
console.log('Server runing')