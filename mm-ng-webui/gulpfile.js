/**
 *  Welcome to your gulpfile!
 *  The gulp tasks are splitted in several files in the gulp directory
 *  because putting all here was really too long
 */

'use strict';

var path = require('path');
var gulp = require('gulp');

/**
 *  This will load all js files in the gulp directory in order to load all
 *  gulp tasks.
 */
[
  'scripts',
  'styles',
  'inject',
  'build',
  'watch',
  'server',
  'unit-tests'
].forEach(function(task) {
  require(path.join(__dirname, 'gulp', task));
});


/**
 *  Default task clean temporaries directories and launch the
 *  main optimization build task
 */
gulp.task('default', gulp.series('clean', 'build'));
