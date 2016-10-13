'use strict'
var Pool = require('pg').Pool
var lib = require('http-helper-functions')
var pge = require('pg-event-producer')

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool = new Pool(config)
var eventProducer = new pge.eventProducer(pool)

function createDQSThen(req, id, selfURL, dqs, callback) {
  var query = `INSERT INTO dqss (id, etag, data) values('${id}', 1, '${JSON.stringify(dqs)}') RETURNING etag`
  function eventData(pgResult) {
    return {id: selfURL, action: 'create', etag: pgResult.rows[0].etag, dqs: dqs}
  }
  pge.queryAndStoreEvent(req, pool, query, 'dqss', eventData, eventProducer, function(err, pgResult, pgEventResult) {
    callback(err, pgResult.rows[0].etag)
  })
}

function withDQSDo(req, id, callback) {
  pool.query('SELECT etag, data FROM dqss WHERE id = $1', [id], function (err, pg_res) {
    if (err) {
      callback(500)
    }
    else {
      if (pg_res.rowCount === 0) { 
        callback(404)
      }
      else {
        var row = pg_res.rows[0]
        callback(null, row.data, row.etag)
      }
    }
  })
}

function deleteDQSThen(req, id, callback) {
  var query = `DELETE FROM dqss WHERE id = '${id}' RETURNING *`
  function eventData(pgResult) {
    return {id: id, action: 'delete', etag: pgResult.rows[0].etag, dqs: pgResult.rows[0].data}
  }
  pge.queryAndStoreEvent(req, pool, query, 'dqss', eventData, eventProducer, function(err, pgResult, pgEventResult) {
    callback(err, pgResult.rows[0].data, pgResult.rows[0].etag)
  })
}

function updateDQSThen(req, id, dqs, patchedDQS, etag, callback) {
  var key = lib.internalizeURL(id, req.headers.host)
  var query = `UPDATE dqss SET (etag, data) = (${(etag+1) % 2147483647}, '${JSON.stringify(patchedDQS)}') WHERE subject = '${key}' AND etag = ${etag} RETURNING etag`
  function eventData(pgResult) {
    return {id: id, action: 'update', etag: pgResult.rows[0].etag, before: dqs, after: patchedDQS}
  }
  pge.queryAndStoreEvent(req, pool, query, 'dqss', eventData, eventProducer, function(err, pgResult, pgEventResult) {
    callback(err, pgResult.rows[0].etag)
  })
}

function init(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS dqss (id text primary key, etag int, data jsonb)'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating permissions table', err)
    } else {
      console.log(`connected to PG at ${config.host}`)
      eventProducer.init(callback)
    }
  })    
}

process.on('unhandledRejection', function(e) {
  console.log(e.message, e.stack)
})

exports.createDQSThen = createDQSThen
exports.updateDQSThen = updateDQSThen
exports.deleteDQSThen = deleteDQSThen
exports.withDQSDo = withDQSDo
exports.withDQSsForUserDo = withDQSsForUserDo
exports.init = init