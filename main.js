// URL
const env = {
    // main : "http://localhost:8080"
    main : "http://ow.grabkeys.net"
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
const cors = require('cors');
const async = require('async');


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
                dbase.collection('users').findOne({ "blizzard.tag" : req.user.battletag }, function(err, result) {
                    if (result) {
                        // update blizzard & overwatch
                        dbase.collection('users').update({ "blizzard.tag" : req.user.battletag }, { $set: { blizzard, overwatch} }, { upsert: true })

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
                            var itemProcess = 0;
                            array.forEach(function(user) {
                                itemProcess ++;
                                dbase.collection('users').update({ "blizzard.tag" : user.blizzard.tag }, { $set: { "profile.userRank" : user.profile.userRank}})
                                if (itemProcess >= array.length) {
                                    res.redirect(env.main + '?token=' + req.user.token)
                                    db.close()  
                                }
                            })
                        });

                    } else {
                        // insert & update profile
                        dbase.collection('users').insertOne({blizzard, overwatch}, function (err, result) {
                            dbase.collection('users').update({ "blizzard.tag" : req.user.battletag}, { $set: { profile }}, { upsert: true }, function (err, result) {
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
                                        dbase.collection('users').update({ "blizzard.tag" : req.user.battletag }, { $set: { "profile.userRank" : user.profile.userRank}})
                                    })
                                    res.redirect(env.main + '?token=' + req.user.token)
                                    db.close()  
                                });
                            })
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
                    case 'silver' : 
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
        
        dbase.collection('users').find({}).sort({"profile.userRank":1 }).limit(100).toArray( function (err, result) {
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

   
    MongoClient.connect(dbUrl, function (err, db) {
        const dbase = db.db('grabkeys-overwatch')
        var users = getJson('user.json')
        // var users = [
        //     { tag: "Lucien-11807" },
        //     { tag : "MisterPlanZa-1847" },
        //     { tag: "Peaches-1107" },
        //     { tag: "SoRa-13892" },
        //     { tag: "Nuttrism-1393" },
        //     { tag: "Arena-11302" },
        //     { tag: "MISSLUNA-11949" },
        //     { tag: "NineOclock-11767" },
        // ]

        var userLength = users.length;
        var userCount = 0;
        var timeData = []
        async.eachSeries(users, function(user, next) {
            
            setTimeout(function() {
                var startProcess = new Date().getTime();
                if (userCount == 100) userCount = 0
                userLength -= 100;
                userCount ++;
                dbase.collection('users').find({ "blizzard.tag" : user.tag }).toArray( function (err, result) {
                    // Request ow data
                    let options = {
                        url: "http://ow-api.herokuapp.com/profile/pc/global/" + user.tag,
                        method: 'GET',
                    }
                    Request(options, function (error, response, body) { 

                        // Skip case
                        if (body == undefined) { next(); return; }
                        if (!response.statusCode ) { next(); return; }
                        if (response.statusCode != 200) { next(); return; }

                        // Process case   
                        body = JSON.parse(body)
                        if (!body.competitive.rank) var rankStr = 'unrank';
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
                        
                        // create profile object
                        const blizzard = {
                                tag : user.tag,
                                rank: rankStr
                        }
                        const profile = {
                                permission : 1,
                        }
                        
                        // update all userRank
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
                            var itemProcess = 0;
                            array.forEach(function(user) {
                                itemProcess ++;
                                dbase.collection('users').update({ "blizzard.tag" : user.blizzard.tag }, { $set: { "profile.userRank" : user.profile.userRank}})
                            })
                        });

                        const overwatch = JSON.parse(response.body)      
                                 
                        if (result.length) { //update
                            dbase.collection('users').update({"blizzard.tag" : blizzard.tag}, {$set: {blizzard, profile, overwatch}}, function (err, result) {
                                if (!err) {
                                    var endProcess = new Date().getTime();
                                    var timeUsed = endProcess - startProcess
                                    timeData.push(timeUsed);
                                    var timeAvg = Math.round(timeData.reduceRight(function(a, b) { return a + b}) / timeData.length) / 1000
                                    var time = timeAvg * (userLength - userCount)
                                    var hour = Math.floor(time / 3600) // 5.55
                                    var minute = Math.floor(((time - (hour * 3600))) / 60)
                                    var sec = Math.floor(time - ((minute * 60) + (hour * 3600)))
                                    console.log("[" + userCount + "/" + userLength + "][" + hour + ":" + minute + ":" + sec + "][" + Math.round(timeUsed / 1000) + "s]" + user.tag + " updated.")
                                    next();
                                }
                            })
                        } else { // insert
                            dbase.collection('users').insertOne({blizzard, profile, overwatch}, function (err, result) {
                                if (!err) {
                                    var endProcess = new Date().getTime();
                                    var timeUsed = endProcess - startProcess
                                    timeData.push(timeUsed);
                                    var timeAvg = Math.round(timeData.reduceRight(function(a, b) { return a + b}) / timeData.length) / 1000
                                    var time = timeAvg * (userLength - userCount)
                                    var hour = Math.floor(time / 3600) // 5.55
                                    var minute = Math.floor(((time - (hour * 3600))) / 60)
                                    var sec = Math.floor(time - ((minute * 60) + (hour * 3600)))
                                    console.log("[" + userCount + "/" + userLength + "][" + hour + ":" + minute + ":" + sec + "][" + Math.round(timeUsed / 1000) + "s]" + user.tag + " inserted.")
                                    next();
                                }
                            })
                        }
                    })
                })
                if (userCount == userLength) { 
                    console.log("Update Finished."
                )}
            }, 100)
        }, function(err) {
            if (err) return console.log(err)
        })
        res.send('ไปดู update ใน console.')
    });
    
})

httpServer.listen(3030);
httpsServer.listen(3443);
console.log('Server runing')