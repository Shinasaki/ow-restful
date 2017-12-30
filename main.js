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


const privateKey = fs.readFileSync('../SSL/privkey.pem').toString();
const certificate = fs.readFileSync('../SSL/fullchain.pem').toString();
const credentials = {key: privateKey, cert: certificate};


app.use(passport.initialize());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors())

passport.serializeUser(function(user, done) {
    done(null, user);
});
  
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

// App setup
const BnetStrategy = require('passport-bnet').Strategy;
const BNET_ID = '3pvwnysm268hq725f5pmgx5pwp5emwpk'
const BNET_SECRET = 'N3XU7nXKhUEHkAhMCtdxAJTfKxe2CHbV'
 

// Use the BnetStrategy within Passport. 
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

app.get('/', function(req, res) {
    res.send('Welcome to grabkeys [Overwatch OAuth API]')
})

// Login
app.get('/bnet/login',
    passport.authenticate('bnet'));

// Callback
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
                blizzard: {
                    userId : req.user.id,
                    tag : req.user.battletag,
                    token : req.user.token
                },
                overwatch: JSON.parse(response.body)
            }

            // update to db
            MongoClient.connect(dbUrl, function (err, db) {
                const dbase = db.db('grabkeys-overwatch')
                dbase.collection('users').update({ "blizzard.userId" : req.user.id } , data, {upsert: true})
            })
        })

        // redirect
        res.redirect(env.main + '?token=' + req.user.token)
});

app.post('/bnet/get', function (req, res) {
    if (!req.body.token) { res.status(401); res.send('required token field'); } else {
        // find user
        console.log(req.body)
        MongoClient.connect(dbUrl, function (err, db) {
            const dbase = db.db('grabkeys-overwatch')
            console.log( req.body.token)
            dbase.collection('users').find({ "blizzard.token" : req.body.token }).toArray(function (err, result) {
                console.log(result)
                if (err) throw err;
                if (typeof(result[0]) != 'undefined' && typeof(result[0]) != undefined) {
                    console.log("'" + result[0].blizzard.tag + "' logged in with token '" + result[0].blizzard.token + "'.")
                }
                res.status(200);
                res.send(result[0])
                db.close()
            })
        })
    }
})

httpServer.listen(3030);
httpsServer.listen(3443);
console.log('Server runing')