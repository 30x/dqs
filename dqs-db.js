'use strict'
var Pool = require('pg').Pool
var lib = require('http-helper-functions')
const db = require('./dqss-pg.js')

function withErrorHandling(req, res, callback) {
  return function (err) {
    if (err == 404) 
      lib.notFound(req, res)
    else if (err)
      lib.internalError(res, err)
    else 
      callback.apply(this, Array.prototype.slice.call(arguments, 1))
  }
}

function createDQSThen(req, res, id, selfURL, dqs, callback) {
  db.createDQSThen(req, id, selfURL, dqs, withErrorHandling(req, res, callback))
}

function withDQSDo(req, res, id, callback) {
  db.withDQSDo(req, id, withErrorHandling(req, res, callback))
}

function deleteDQSThen(req, res, id, callback) {
  db.deleteDQSThen(req, id, withErrorHandling(req, res, callback))
}

function updateDQSThen(req, res, id, dqs, patchedDQS, etag, callback) {
  db.updateDQSThen(req, id, dqs, patchedDQS, etag, withErrorHandling(req, res, callback))
}

function init(callback) {
  db.init(callback)
}

exports.createDQSThen = createDQSThen
exports.updateDQSThen = updateDQSThen
exports.deleteDQSThen = deleteDQSThen
exports.withDQSDo = withDQSDo
exports.withDQSsForUserDo = withDQSsForUserDo
exports.init = init