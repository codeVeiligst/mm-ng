'use strict';

var path = require('path');
var gulp = require('gulp');
var conf = require('./conf');

var inject = require('gulp-inject');
var wiredep = require('wiredep').stream;
var _ = require('lodash');

function injectFiles() {
  var injectStyles = gulp.src([
    path.join(conf.paths.tmp, '/serve/app/**/*.css'),
    path.join('!' + conf.paths.tmp, '/serve/app/vendor.css')
  ], { read: false });

  var injectScripts = gulp.src([
    path.join(conf.paths.tmp, '/serve/app/**/*.module.js')
  ], { read: false });

  var injectOptions = {
    ignorePath: [conf.paths.src, path.join(conf.paths.tmp, '/serve')],
    addRootSlash: false
  };

  return gulp.src(path.join(conf.paths.src, '/*.html'))
    .pipe(inject(injectStyles, injectOptions))
    .pipe(inject(injectScripts, injectOptions))
    .pipe(wiredep(_.extend({}, conf.wiredep)))
    .pipe(gulp.dest(path.join(conf.paths.tmp, '/serve')));
}

gulp.task('inject-files', injectFiles);
gulp.task('inject', gulp.series(gulp.parallel('scripts', 'styles'), 'inject-files'));
