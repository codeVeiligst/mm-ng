'use strict';

var path = require('path');
var fs = require('fs');
var gulp = require('gulp');
var conf = require('./conf');

var browserSync = require('browser-sync');
var log = require('fancy-log');
var webpack = require('webpack-stream');

function webpackWrapper(watch, includeSpecs, callback) {
  var done = callback || function() {};
  var completed = false;
  var nodeDetailControllers = fs.readdirSync(path.resolve(conf.paths.src, 'app/nodedetail'))
    .filter(function(file) {
      return /\.controller\.ts$/.test(file);
    })
    .map(function(file) {
      return path.resolve(conf.paths.src, 'app/nodedetail', file);
    });

  var webpackOptions = {
    mode: 'production',
    entry: [
      path.resolve(conf.paths.src, 'app/components/sankey/sankey.js'),
      path.resolve(conf.paths.src, 'app/components/sankey/mmsankey.js'),
      path.resolve(conf.paths.src, 'app/components/easypiechart/angular.easypiechart.js'),
      path.resolve(conf.paths.src, 'app/index.module.ts')
    ].concat(nodeDetailControllers),
    // AngularJS is already loaded by the Bower vendor script in index.html.
    // Keeping it external avoids creating a second Angular module registry
    // when legacy UMD components call require("angular").
    externals: {
      angular: 'angular'
    },
    resolve: {
      modules: [
        path.resolve('node_modules'),
        path.resolve('bower_components')
      ],
      extensions: ['.ts', '.js']
    },
    watch: watch,
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            'ng-annotate-loader',
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true
              }
            }
          ]
        }
      ]
    },
    output: {
      filename: 'index.module.js'
    }
  };

  if (watch) {
    webpackOptions.mode = 'development';
    webpackOptions.devtool = 'inline-source-map';
  }

  if (includeSpecs) {
    webpackOptions.entry.push(path.resolve(conf.paths.src, 'app/dashboard/dashboard.controller.spec.ts'));
  }

  return gulp.src(path.join(conf.paths.src, '/app/index.module.ts'))
    .pipe(webpack(webpackOptions, null, function(err, stats) {
      if (err) {
        conf.errorHandler('Webpack')(err);
      }

      log(stats.toString({
        colors: true,
        chunks: false,
        hash: false,
        version: false
      }));

      browserSync.reload();
      if (watch && !completed) {
        completed = true;
        done();
      }
    }))
    .pipe(gulp.dest(path.join(conf.paths.tmp, '/serve/app')));
}

gulp.task('scripts', function () {
  return webpackWrapper(false, false);
});

gulp.task('scripts:watch', function (callback) {
  return webpackWrapper(true, false, callback);
});

gulp.task('scripts:test', function () {
  return webpackWrapper(false, true);
});

gulp.task('scripts:test-watch', function (callback) {
  return webpackWrapper(true, true, callback);
});
