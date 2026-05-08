'use strict';

var gulp = require('gulp');

gulp.task('test', gulp.series('scripts:test', function(done) {
  done();
}));

gulp.task('test:auto', gulp.series('scripts:test-watch', function(done) {
  done();
}));
