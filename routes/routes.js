var Comment = require('../models/comment');
var Amzreviews = require('../models/amzreview');
var Amzlabels = require('../models/amzlabel');
var User = require('../models/user');

/*for data tokenizer*/
var Tokenizer = require('sentence-tokenizer');
var tokenizer = new Tokenizer('Chuck');

const fs = require('fs');
const request = require('request');

module.exports = function(app, passport) {
    // HOME PAGE
    app.get('/', function(req, res) {
        res.render('codecomments.pug', { title: 'Comment Annotator' });
        // simulateLoginForMe('abhi@usc.edu', '1234', req, res);
    });


    // code comments annotation index page
    app.get('/codecomments', (req, res) => {
        fs.readFile('data-test-cc/test.java', 'utf-8', (err, data) => {
            if(err) { return console.log(err); }

            var re = /(\/\*([^*]|[\r\n]|(\*+([^*\/]|[\r\n])))*\*+\/)|(\/\/.*)/gm;
            var arrComments = data.match(re);

            res.render('codecomments.pug',{
                user: req.user,
                srcCodeContent: data,
                commentList : arrComments
            });
        });
    });


    app.post('/addAnnotation', (req, res) => {
        console.log('form submitted!');
        // res.send(JSON.parse(req.body.dataJson));

        User.findOne({ 'local.email': 'abhi@usc.edu' }, function (err, user) {
            if (err)
                return next(err);

            var bodyData = JSON.parse(req.body.dataJson);
            // var newComment = new Comment();

            // for (var i in bodyData.comments) {

            var newUser = new User();
            // newUser = user;
            newUser['annotated']['text'] = bodyData.comments[0].text;
            newUser['annotated']['category'] = bodyData.comments[0].label;

            console.log(newUser.annotated);

            newUser.save(function(err, newuser) {
                if (err)
                    throw err;
                res.send(newuser);
            });
            // }
        });
    });


    // LOGIN ===============================
    // show the login form
    app.get('/login', function(req, res) {
        res.render('login.pug', { message: req.flash('loginMessage') });
    });


    // process the login form
    app.post('/login', passport.authenticate('local-login', {
          // successRedirect : '/profile', // redirect to the secure profile section
          successRedirect : '/home',
          failureRedirect : '/login', // redirect back to the signup page if there is an error
          failureFlash : true
    }));

    // SIGNUP ==============================
    // show the signup form
    app.get('/signup', function(req, res) {
        res.render('signup.pug', { message: req.flash('signupMessage') });
    });


    // process the signup form
    app.post('/signup', passport.authenticate('local-signup', {
        // successRedirect : '/profile',
        successRedirect: '/home',
        failureRedirect : '/signup',
        failureFlash : true
    }));

    // LOGOUT ==============================
    app.get('/logout', function(req, res) {
        req.logout();
        res.redirect('/');
    });


    // PROFILE SECTION =====================
    // protected section, must be logged in, using route middleware to verify
    app.get('/profile', isLoggedIn , function(req, res) {
        Comment.find({}, 'text', (err, docs) => {
            if(err)
                return next(err);
            res.render('profile.pug', {
                user : req.user, // get the user out of session and pass to template
                commentsList : docs
            });
        });
    });

    app.get('/home', isLoggedIn, function(req,res){
        res.render('home.pug',{
            user: req.user,
            errorMessage: req.flash('error')
        })
    });

    //TODO: assign user to certain review, now is random
    //TODO: might need to also check if users has already done this review, randomly select another review
    app.get('/amzreviews', isLoggedIn, function(req,res){
        //randomly select x review(s)
        Amzreviews.aggregate([{$sample: {size: 1}}],function(err,reviews){
            Amzlabels.find({user_id: req.user._id}).distinct('review_id', function(err,data){
                if(err)
                    return next(err);
                done_num = data.length;
                review = reviews[0];
                tokenizer.setEntry(review.reviewText);
                sentences = tokenizer.getSentences();
                res.render('amzreviews.pug',{
                    user: req.user,
                    reviews: review,
                    sentences: sentences,
                    done_many: done_num,
                    errorMessage: req.flash('error'),
                    successMessage: req.flash('success')
                });
            });
        });
    });


    // ADMIN SECTION =====================
    app.get('/admin', [isLoggedIn,redirectifnotAdmin], function(req, res) {
        req.flash('success','Test flash message.');
        res.render('admin.pug', {
            user : req.user,
            successMessage: req.flash('success')
        });
    });

    //submit label
    //TODO: add sub category when saved and also emotion
    app.post('/amzreview-submit',function(req,res,next){
        var data = req.body;
        // Below is for debugging
        // var data = { user_id: '597078f55d06cd4c7488b48d',
        //           review_id: '5975aa1b3f3ccf5a0bb15904',
        //           sent_1: '1',
        //           sent_1_cat_1: '1',
        //           sent_2: '1',
        //           sent_2_cat_1: '1',
        //           sent_3: '0',
        //           sent_3_cat_0: '1',
        //           sent_4: '1',
        //           sent_4_cat_1: '1',
        //           sent_5: '1',
        //           sent_5_cat_1: '1',
        //           sent_6: '1',
        //           sent_6_cat_1: [ '1', '2' ],
        //           sent_7: [ '1', '2' ],
        //           sent_7_cat_1: '1',
        //           sent_7_cat_2: '1',
        //           sent_8: '2',
        //           sent_8_cat_2: [ '1', '2' ],
        //           sent_9: '2',
        //           sent_9_cat_2: '1' }
        var sent_cat = [];
        var sent_sub_cat = [];
        for(var attributename in data){
            if (attributename == "user_id" || attributename == "review_id")
                continue;
            if (~attributename.indexOf('cat')){
                var label_cat = {};
                label_cat[attributename] = data[attributename]
                sent_sub_cat.push(label_cat);
            }
            else
            {
                var label = {};
                label[attributename] = data[attributename]
                sent_cat.push(label);
            }
        }
        //save to the db
        var newlabel = new Amzlabels({});
        newlabel.user_id = data.user_id;
        newlabel.review_id = data.review_id;
        newlabel.sent_labels = sent_cat;
        newlabel.sent_sub_cats = sent_sub_cat;
        newlabel.save(function(err){
            if(err)
                res.send(err);
            else{
                console.log("Data saved");
                req.flash('success','Saved to the database successfully')
                res.redirect('back');
            }
        });
    });

    app.get('/admin/allreviews', [isLoggedIn,redirectifnotAdmin], function(req,res){
        Amzreviews.find({}, function(error,reviews){
            var total_num = reviews.length;
            Amzlabels.find({}, 'user_id review_id', function(err,labeledreviews){
                var distinct_labeled_review_id = getDistinctLabel(labeledreviews);
                res.render('allreviews.pug',{
                    user : req.user,
                    total_num : total_num,
                    labeled_reviews: distinct_labeled_review_id
                });
            });
        });
    });

    app.get('/admin/allusers', [isLoggedIn,redirectifnotAdmin], function(req,res){
        User.find({}, function(error,users){
            console.log(users);
            res.render('allusers.pug', {
                user : req.user,
                users : users
            });
        });
    });

};


// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();
    else{
        console.log("not logged in");
        res.redirect('/');// if they aren't redirect them to the home page
    }
}

function redirectifnotAdmin(req, res, next) {
    if(req.user.local.isAdmin){
        console.log("admin is here! granted access");
        return next();
    }
    else{
        console.log("not an admin, go back!");
        req.flash('error','You are not authorized!');
        res.redirect('/home');
    }
}

function getDistinctLabel(arrayitem){
    var unique = {};
    var labeled_r_id = {};
    var distinct = [];
    for(var item in arrayitem){
        review_id = JSON.stringify(arrayitem[item].review_id);
        user_id = JSON.stringify(arrayitem[item].user_id);
        if( typeof(unique[review_id]) == "undefined"){
            // distinct.push(arrayitem[item].review_id);
            list_user = [];
            list_user.push(user_id);
            labeled_r_id[review_id] = list_user;
            unique[review_id] = 0;
        }else{
            if(!labeled_r_id[review_id].includes(user_id)){
                labeled_r_id[review_id].push(user_id);
            }
        }
    }
    for(var item in labeled_r_id){
        var each_review = {};
        each_review["review_id"] = item;
        each_review["num_users"] = labeled_r_id[item].length;
        distinct.push(each_review);
    }
    return distinct;
}
