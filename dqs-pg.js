'use strict'
const Pool = require('pg').Pool

var config = {
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
}

var pool = new Pool(config)

// The following function adapted from https://github.com/broofa/node-uuid4 under MIT License
// Copyright (c) 2010-2012 Robert Kieffer
const randomBytes = require('crypto').randomBytes
var toHex = Array(256)
for (var val = 0; val < 256; val++) 
  toHex[val] = (val + 0x100).toString(16).substr(1)
function uuid4() {
  var buf = randomBytes(16)
  buf[6] = (buf[6] & 0x0f) | 0x40
  buf[8] = (buf[8] & 0x3f) | 0x80
  var i=0
  return  toHex[buf[i++]] + toHex[buf[i++]] +
          toHex[buf[i++]] + toHex[buf[i++]] + '-' +
          toHex[buf[i++]] + toHex[buf[i++]] + '-' +
          toHex[buf[i++]] + toHex[buf[i++]] + '-' +
          toHex[buf[i++]] + toHex[buf[i++]] + '-' +
          toHex[buf[i++]] + toHex[buf[i++]] +
          toHex[buf[i++]] + toHex[buf[i++]] +
          toHex[buf[i++]] + toHex[buf[i++]]
}
// End of section of code adapted from https://github.com/broofa/node-uuid4 under MIT License

function createDQSThen(id, selfURL, dqs, callback) {
  var query = `INSERT INTO dqss (id, etag, data) values('${id}', '${uuid4()}', '${JSON.stringify(dqs)}') RETURNING etag`
  pool.query(query, function(err, pg_res) {
    if (err) {
      callback(500)
    }
    else {
      if (pg_res.rowCount === 0) { 
        callback(404)
      }
      else {
        var row = pg_res.rows[0]
        callback(null, row.etag)
      }
    }    
  })
}

function withDQSDo(id, callback) {
  pool.query(`SELECT etag, data FROM dqss WHERE id = ${id}`, function (err, pg_res) {
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

function withDQSFromNameDo(name, callback) {
  pool.query(`SELECT etag, data FROM dqss WHERE data @> '{"name": "${name}"}'`, function (err, pg_res) {
    if (err)
      callback(500)
    else 
      if (pg_res.rowCount === 0) 
        callback(404)
      else if (pg_res.rowCount > 1)
        callback(409)
      else {
        var row = pg_res.rows[0]
        callback(null, row.data, row.etag)
      }
  })
}

function deleteDQSThen(id, callback) {
  pool.query(`DELETE FROM dqss WHERE id = '${id}' RETURNING *`, function (err, pg_res) {
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

function updateDQSThen(id, dqs, patchedDQS, etag, callback) {
  var query = `UPDATE dqss SET (etag, data) = (${uuid4()}, '${JSON.stringify(patchedDQS)}') WHERE id = '${id}' AND etag = ${etag} RETURNING etag`
  pool.query(query, function (err, pg_res) {
    if (err) {
      callback(500)
    }
    else {
      if (pg_res.rowCount === 0) { 
        callback(404)
      }
      else 
        callback(null, pg_res.rows[0].etag)
    }
  })
}

function init(callback) {
  var query = 'CREATE TABLE IF NOT EXISTS dqss (id text primary key, etag text, data jsonb)'
  pool.query(query, function(err, pgResult) {
    if(err) {
      console.error('error creating permissions table', err)
    } else {
      console.log(`connected to PG at ${config.host}`)
      callback()
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
exports.withDQSFromNameDo = withDQSFromNameDo
exports.init = init