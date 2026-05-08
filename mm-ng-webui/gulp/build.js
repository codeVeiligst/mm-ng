'use strict';

var path = require('path');
var gulp = require('gulp');
var conf = require('./conf');

var angularTemplatecache = require('gulp-angular-templatecache');
var del = require('del');
var inject = require('gulp-inject');

gulp.task('partials', function () {
  return gulp.src([
    path.join(conf.paths.src, '/app/**/*.html')
  ])
    .pipe(angularTemplatecache('templateCacheHtml.js', {
      module: 'minemeldWebui',
      root: 'app'
    }))
    .pipe(gulp.dest(conf.paths.tmp + '/partials/'));
});

gulp.task('html', gulp.series('inject', 'partials', function () {
  var partialsInjectFile = gulp.src(
    path.join(conf.paths.tmp, '/partials/templateCacheHtml.js'),
    { read: false }
  );

  var partialsInjectOptions = {
    starttag: '<!-- inject:partials -->',
    ignorePath: path.join(conf.paths.tmp, '/partials'),
    addRootSlash: false
  };

  return gulp.src(path.join(conf.paths.tmp, '/serve/*.html'))
    .pipe(inject(partialsInjectFile, partialsInjectOptions))
    .pipe(gulp.dest(path.join(conf.paths.dist, '/')));
}));

gulp.task('app-assets', function () {
  return gulp.src([
    path.join(conf.paths.tmp, '/serve/app/**/*')
  ], { base: conf.paths.tmp + '/serve' })
    .pipe(gulp.dest(path.join(conf.paths.dist, '/')));
});

gulp.task('partials-assets', function () {
  return gulp.src(path.join(conf.paths.tmp, '/partials/**/*'))
    .pipe(gulp.dest(path.join(conf.paths.dist, '/')));
});

gulp.task('bower-assets', function () {
  return gulp.src('bower_components/**/*', { base: '.' })
    .pipe(gulp.dest(path.join(conf.paths.dist, '/')));
});

gulp.task('other', function () {
  return gulp.src([
    path.join(conf.paths.src, '/**/*'),
    path.join('!' + conf.paths.src, '/**/*.{html,css,js,scss,ts}')
  ], { base: conf.paths.src })
    .pipe(gulp.dest(path.join(conf.paths.dist, '/')));
});

gulp.task('clean', function () {
  return del([
    path.join(conf.paths.dist, '/'),
    path.join(conf.paths.tmp, '/partials'),
    path.join(conf.paths.tmp, '/serve')
  ]);
});

gulp.task('build', gulp.series(
  'clean',
  'html',
  gulp.parallel('app-assets', 'partials-assets', 'bower-assets', 'other')
));
