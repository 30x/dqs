'use strict'
var http = require('http')
var url = require('url')
var lib = require('http-helper-functions')
var db = require('./dqs-db.js')

var DQSS = '/dqss/'

function verifyDQS(req, dqs, user) {
  var rslt = lib.setStandardCreationProperties(req, dqs, user)
  if (dqs.isA == 'DQS')
    if (Array.isArray(dqs.members))
      return null
    else
      return 'dqs must have an array of members'
  else
    return 'invalid JSON: "isA" property not set to "DQS" ' + JSON.stringify(dqs)
}

function createDQS(req, res, dqs) {
  var user = lib.getUser(req)
  if (user == null)
    lib.unauthorized(req, res)
  else { 
    var err = verifyDQS(req, dqs, user)
    if (err !== null) 
      lib.badRequest(res, err)
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
  }
}

function makeSelfURL(req, key) {
  return '//' + req.headers.host + DQSS + key
}

function getDQS(req, res, id) {
  lib.ifAllowedThen(req, res, null, '_self', 'read', function() {
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
  lib.ifAllowedThen(req, res, null, '_self', 'delete', function() {
    db.deleteDQSThen(req, res, id, function (dqs, etag) {
      lib.found(req, res, dqs, dqs.etag)
    })
  })
}

function updateDQS(req, res, id, patch) {
  lib.ifAllowedThen(req, res, null, '_self', 'update', function(dqs, etag) {
    lib.applyPatch(req, res, dqs, patch, function(patchedDQS) {
      db.updateDQSThen(req, res, id, dqs, patchedDQS, etag, function (etag) {
        patchedPermissions.self = selfURL(id, req) 
        lib.found(req, res, dqs, etag)
      })
    })
  })
}

function getDQSsForUser(req, res, user) {
  var requestingUser = lib.getUser(req)
  user = lib.internalizeURL(user, req.headers.host)
  if (user == requestingUser) {
    db.withDQSsForUserDo(req, res, user, function (dqsIDs) {
      var rslt = {
        self: `protocol://authority${req.url}`,
        contents: dqsIDs.map(id => `//${req.headers.host}${DQSS}${id}`)
      }
      lib.externalizeURLs(rslt)
      lib.found(req, res, rslt)
    })
  } else
    lib.forbidden(req, res)
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
    } else if (req_url.pathname == '/dqss' && req_url.search !== null)
      getDQSsForUser(req, res, req_url.search.substring(1))
    else
      lib.notFound(req, res)
  }
}

db.init(function(){
  var port = process.env.PORT
  http.createServer(requestHandler).listen(port, function() {
    console.log(`server is listening on ${port}`)
  })
})