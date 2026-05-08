'use strict';

var path = require('path');
var gulp = require('gulp');
var conf = require('./conf');

var browserSync = require('browser-sync');

function isOnlyChange(event) {
  return event.type === 'changed';
}

function watchFiles(done) {
  gulp.watch([path.join(conf.paths.src, '/*.html'), 'bower.json'], gulp.series('inject-files'));

  gulp.watch([
    path.join(conf.paths.src, '/app/**/*.css'),
    path.join(conf.paths.src, '/app/**/*.scss')
  ], function(event) {
    if (isOnlyChange(event)) {
      return gulp.series('styles')();
    }
    return gulp.series('styles', 'inject-files')();
  });

  gulp.watch(path.join(conf.paths.src, '/app/**/*.html'), function(event) {
    browserSync.reload(event.path);
  });

  done();
}

gulp.task('watch', gulp.series(gulp.parallel('scripts:watch', 'styles'), 'inject-files', watchFiles));
