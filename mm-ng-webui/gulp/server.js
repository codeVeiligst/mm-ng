'use strict';

var path = require('path');
var gulp = require('gulp');
var args = require('yargs').argv;
var conf = require('./conf');

var browserSync = require('browser-sync');
var browserSyncSpa = require('browser-sync-spa');
var { createProxyMiddleware } = require('http-proxy-middleware');

function browserSyncInit(baseDir, browser) {
  browser = browser === undefined ? 'default' : browser;

  var routes = null;
  if (baseDir === conf.paths.src || (Array.isArray(baseDir) && baseDir.indexOf(conf.paths.src) !== -1)) {
    routes = {
      '/bower_components': 'bower_components'
    };
  }

  var server = {
    baseDir: baseDir,
    routes: routes
  };

  if (args.url) {
    server.middleware = createProxyMiddleware(
      [
        '/login', '/logout', '/status', '/metrics',
        '/prototype', '/config', '/supervisor', '/feeds',
        '/validate', '/traced', '/aaa', '/logs', '/extensions',
        '/jobs'
      ],
      { target: args.url, secure: false, changeOrigin: true }
    );
  }

  browserSync.instance = browserSync.init({
    startPath: '/',
    server: server,
    browser: browser,
    port: args.port || 3000,
    ui: {
      port: args.uiPort || 3001
    }
  });
}

browserSync.use(browserSyncSpa({
  selector: '[ng-app]'
}));

gulp.task('serve', gulp.series('watch', function () {
  browserSyncInit([path.join(conf.paths.tmp, '/serve'), conf.paths.src]);
}));

gulp.task('serve:dist', gulp.series('build', function () {
  browserSyncInit(conf.paths.dist);
}));

gulp.task('serve:e2e', gulp.series('inject', function () {
  browserSyncInit([conf.paths.tmp + '/serve', conf.paths.src], []);
}));

gulp.task('serve:e2e-dist', gulp.series('build', function () {
  browserSyncInit(conf.paths.dist, []);
}));
