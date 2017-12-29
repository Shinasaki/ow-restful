// Default app
var express = require('express')
var app = express()
const bodyParser = require('body-parser')
const cors = require('cors')
const passport = require('passport')
const axios = require('axios')

app.use(bodyParser.json());
app.use(cors())



app.get('/', function (req, res) {
    res.send('hello world')
})
var BnetStrategy = require('passport-bnet').Strategy;
var BNET_ID = '3pvwnysm268hq725f5pmgx5pwp5emwpk'
var BNET_SECRET = 'N3XU7nXKhUEHkAhMCtdxAJTfKxe2CHbV'
 
// Use the BnetStrategy within Passport. 
passport.use(new BnetStrategy({
    clientID: BNET_ID,
    clientSecret: BNET_SECRET,
    callbackURL: "https://grabkeys.net:3000/bnet/user/callback"
}, function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
}));

app.get('/bnet/user/login',
    passport.authenticate('bnet'));
 
app.get('/bnet/user/callback',
    passport.authenticate('bnet', { failureRedirect: '/' }),
    function(req, res){
        res.redirect('/');
    });

app.listen(3000)
console.log('App is listening to port 3000.')