var gulp = require('gulp'),
    fs = require('fs'),
    usemin = require('gulp-usemin'),
    uglify = require('gulp-uglify'),
    minifyHtml = require('gulp-minify-html'),
    minifyCss = require('gulp-minify-css'),
    rev = require('gulp-rev'),
    inject = require('gulp-inject'),
    ngAnnotate = require('gulp-ng-annotate'),
    templateCache = require('gulp-angular-templatecache'),
    exec = require('child_process').exec,
    rsync = require('gulp-rsync');

gulp.task('templates', function(){
    return gulp.src('public/templates/*.html')
        .pipe(templateCache({module: 'app', root: 'templates/'}))
        .pipe(gulp.dest('public/src/'));
});
gulp.task('build', ['templates'], function() {
    return gulp.src('public/index.html')
        .pipe(usemin({
            css: [minifyCss(), 'concat', rev()],
            html: [minifyHtml({empty: true})],
            js: [ngAnnotate(), uglify(), rev()]
        }))
        .pipe(gulp.dest('build/'));
});
gulp.task('cleanup', ['build'], function(){
    fs.writeFileSync('public/src/templates.js', '');
});
gulp.task('release', ['cleanup'], function(done){
    exec('rsync -rLv build/ x.29a.ch:/var/www/static/sandbox/2014/guitarTrainer/', {}, function(error, stdout, stderr){
        console.log(stdout);
        console.log(stderr);
        done();
    });
});
gulp.task('default', ['cleanup']);
