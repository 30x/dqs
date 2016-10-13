'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const pLib = require('permissions-helper-functions')
const db = require('./dqs-db.js')

const DQSS = '/dqss/'

function verifyDQS(req, dqs, user) {
  var rslt = lib.setStandardCreationProperties(req, dqs, user)
  if (dqs.isA == 'DQS')
    if (dqs.customer == null)
      return 'DQS must reference the customer for which it is being created'
    else
      return null
  else
    return 'invalid JSON: "isA" property not set to "DQS" ' + JSON.stringify(dqs)
}

function createDQS(req, res, dqs) {
  var user = lib.getUser(req.headers.authorization)
  if (user == null)
    lib.unauthorized(req, res)
  else { 
    var err = verifyDQS(req, dqs, user)
    if (err !== null) 
      lib.badRequest(res, err)
    else
      pLib.ifAllowedThen(req.headers, dqs.customer, 'dqss', 'create', function(err, reason) {
        if (err)
          lib.internalError(res, reason)
        else {
          var permissions = dqs.permissions
          if (permissions !== undefined)
            delete dqs.permissions
          var id = lib.uuid4()
          var selfURL = makeSelfURL(req, id)
          lib.createPermissonsFor(req, res, selfURL, permissions, function(permissionsURL, permissions, responseHeaders){
            // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
            // there will be a useless but harmless permissions document.
            // If we do things the other way around, a dqs without matching permissions could cause problems.
            db.createDQSThen(req, res, id, selfURL, dqs, function(etag) {
              dqs.self = selfURL 
              lib.created(req, res, dqs, dqs.self, etag)
            })
          })
        }
      })
  }
}

function makeSelfURL(req, key) {
  return '//' + req.headers.host + DQSS + key
}

function getDQS(req, res, id) {
  pLib.ifAllowedThen(req.headers, null, '_self', 'read', function(err, reason) {
    if (err)
      lib.internalError(res, reason)
    else
      db.withDQSDo(req, res, id, function(dqs , etag) {
        dqs.self = makeSelfURL(req, id)
        dqs._permissions = `protocol://authority/permissions?${dqs.self}`
        dqs._permissionsHeirs = `protocol://authority/permissions-heirs?${dqs.self}`
        lib.externalizeURLs(dqs, req.headers.host)
        lib.found(req, res, dqs, etag)
      })
  })
}

function deleteDQS(req, res, id) {
  pLib.ifAllowedThen(req.headers, null, '_self', 'delete', function(err, reason) {
    if (err)
      lib.internalError(res, reason)
    else
      db.deleteDQSThen(req, res, id, function (dqs, etag) {
        lib.found(req, res, dqs, dqs.etag)
      })
  })
}

function updateDQS(req, res, id, patch) {
  pLib.ifAllowedThen(req.headers, null, '_self', 'update', function(err, reason) {
    if (err)
      lib.internalError(res, reason)
    else
      lib.applyPatch(req, res, dqs, patch, function(patchedDQS) {
        db.updateDQSThen(req, res, id, dqs, patchedDQS, etag, function (etag) {
          patchedPermissions.self = selfURL(id, req) 
          lib.found(req, res, dqs, etag)
        })
      })
  })
}

function requestHandler(req, res) {
  if (req.url == '/dqss') 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, createDQS)
    else 
      lib.methodNotAllowed(req, res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname.lastIndexOf(DQSS, 0) > -1) {
      var id = req_url.pathname.substring(DQSS.length)
      if (req.method == 'GET')
        getDQS(req, res, id)
      else if (req.method == 'DELETE') 
        deleteDQS(req, res, id)
      else if (req.method == 'PATCH') 
        lib.getPostBody(req, res, function (req, res, jso) {
          updateDQS(req, res, id, jso)
        })
      else
        lib.methodNotAllowed(req, res, ['GET', 'DELETE', 'PATCH'])
    } else
      lib.notFound(req, res)
  }
}

db.init(function(){
  var port = process.env.PORT
  http.createServer(requestHandler).listen(port, function() {
    console.log(`server is listening on ${port}`)
  })
})