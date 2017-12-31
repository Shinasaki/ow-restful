// URL
const env = {
    main : "http://localhost:8080"
    // main : "http://ow.grabkeys.net"
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
            body = JSON.parse(body)
            // filter rank
            if (!body.competitive.rank) {
                var rankStr = 'unrank'
            } else {
                var rank = body.competitive.rank / 500;
                var rankStr = 'unrank'
                if (rank == null || rank == 0) { rankStr = 'unrank' } 
                else if ( rank <= 2 ) { rankStr = 'bronze' }
                else if ( rank >= 3 && rank < 4 ) { rankStr = 'silver' }
                else if ( rank >= 4 && rank < 5 ) { rankStr = 'gold' }
                else if ( rank >= 5 && rank < 6 ) { rankStr = 'platinum' }
                else if ( rank >= 6 && rank < 7 ) { rankStr = 'daimond' }
                else if ( rank >= 7 && rank < 8 ) { rankStr = 'master' }
                else if ( rank >= 8 && rank <= 9 ) { rankStr = 'grandmaster' }
            }
            // create profile object
            const blizzard = {
                    userId : req.user.id,
                    tag : req.user.battletag,
                    token : req.user.token,
                    rank: rankStr
            }
            const profile = {
                    userId : req.user.id,
                    permission : 1,
            }
            const overwatch = JSON.parse(response.body)

            MongoClient.connect(dbUrl, function (err, db) {
                const dbase = db.db('grabkeys-overwatch')
                dbase.collection('users').findOne({ "blizzard.userId" : req.user.id }, function(err, result) {
                    if (result) {
                        // update blizzard & overwatch
                        dbase.collection('users').update({ "blizzard.userId" : req.user.id }, { $set: { blizzard, overwatch} }, { upsert: true })

                        // update userRank all
                        dbase.collection('users').find({}).toArray(function (err, result) {
                            var array = [];
                            for (var key in result) {
                                if (result[key].overwatch.competitive.rank == null) { result[key].overwatch.competitive.rank = 0 }
                                array.push(result[key])
                            }
                            array.sort(function(a, b) {
                                return b.overwatch.competitive.rank - a.overwatch.competitive.rank;
                            });
                            for (var i = 0; i < array.length; i++) {
                                array[i].profile.userRank = i + 1;
                            }
                            array.forEach(function(user) {
                                dbase.collection('users').update({"blizzard.userId" : user.blizzard.userId }, { $set: { "profile.userRank" : user.profile.userRank}})
                            })
                            res.redirect(env.main + '?token=' + req.user.token)
                            db.close()  
                        });

                    } else {
                        // insert & update profile
                        dbase.collection('users').insertOne({blizzard, overwatch});
                        dbase.collection('users').update({ "blizzard.userId" : req.user.id }, { $set: { profile }}, { upsert: true })
                        // update userRank all
                        dbase.collection('users').find({}).toArray(function (err, result) {
                            var array = [];
                            for (var key in result) {
                                if (result[key].overwatch.competitive.rank == null) { result[key].overwatch.competitive.rank = 0 }
                                array.push(result[key])
                            }
                            array.sort(function(a, b) {
                                return b.overwatch.competitive.rank - a.overwatch.competitive.rank;
                            });
                            for (var i = 0; i < array.length; i++) {
                                array[i].profile.userRank = i + 1;
                            }
                            array.forEach(function(user) {
                                dbase.collection('users').update({"blizzard.userId" : user.blizzard.userId }, { $set: { "profile.userRank" : user.profile.userRank}})
                            })
                            res.redirect(env.main + '?token=' + req.user.token)
                            db.close()  
                        });
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
            dbase.collection('users').findOne({ "blizzard.token" : req.body.token }, function (err, result) {
                if (err) throw err;
                if (result) {
                    res.status(200);
                    res.send(result)
                } else {
                    // จริงๆคือบางครั้งเวลาของการ update และ find มันพร้อมกันเลยหาไม่เจอ
                    console.log("'token does not match.");
                    res.status(403);
                    res.send("token does not match.");
                    db.close();
                }
            })
        })
    }
})

app.get('/bnet/rank', function (req, res) {
    MongoClient.connect(dbUrl, function (err, db) {
        const dbase = db.db('grabkeys-overwatch')
        dbase.collection('users').find().toArray( function (err, result) {
            var rankCount = {
                all : 0,
                unrank : 0,
                bronze : 0,
                silver : 0,
                gold : 0,
                platinum : 0,
                diamond : 0,
                master : 0,
                grandmaster : 0,
            }
            result.forEach(function(user) {
                rankCount.all ++;
                switch (user.blizzard.rank) {
                    case 'unrank' :
                        rankCount.unrank ++;
                        break;
                    case 'bronze' :
                        rankCount.bronze ++;
                        break;
                    case 'sliver' : 
                        rankCount.silver ++;
                        break;
                    case 'gold' :
                        rankCount.gold ++;
                        break;
                    case 'platinum' :
                        rankCount.platinum ++;
                        break;
                    case 'daimond' :
                        rankCount.diamond ++;
                        break;
                    case 'master' :
                        rankCount.master ++;
                        break;
                    case 'grandmaster' :
                        rankCount.grandmaster ++;
                        break;
                }
            })
            res.send(rankCount)
            res.status(200)
        })
    });
})

app.get('/bnet/top', function (req, res) {
    
    MongoClient.connect(dbUrl, function (err, db) {
        const dbase = db.db('grabkeys-overwatch')
        
        dbase.collection('users').find({}).sort({"profile.userRank":1}).limit(100).toArray( function (err, result) {
            var dataset = []
            result.forEach(function(user) {
                let data = {
                    top: user.profile.userRank,
                    tag: user.blizzard.tag.split("-")[0],
                    rank: user.overwatch.competitive.rank == null ? 0 : user.overwatch.competitive.rank,
                    portrait: user.overwatch.portrait,
                    time: user.overwatch.playtime.competitive
                }
                dataset.push(data)
            })
            res.send(dataset)
        })
    });
        
})


app.get('/bnet/update', function (req, res) {
    function readJsonFileSync(filepath, encoding){

        if (typeof (encoding) == 'undefined'){
            encoding = 'utf8';
        }
        var file = fs.readFileSync(filepath, encoding);
        return JSON.parse(file);
    }
    function getJson(file){
    
        var filepath = __dirname + '/' + file;
        return readJsonFileSync(filepath);
    }

    var users = getJson('user.json')
    users.forEach(function (user) {
        console.log(user)
    })
})

httpServer.listen(3030);
httpsServer.listen(3443);
console.log('Server runing')