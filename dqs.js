'use strict'
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')
const pLib = require('permissions-helper-functions')
const db = require('./dqs-db.js')

const DQSS = '/dqss-'

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

function allocateSpace(req, res, id, selfURL, dqs, callback) {
  // for Cassandra, this would mean picking a cluster and creating a keyspace
  callback()
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
      pLib.ifAllowedThen(req, res, dqs.customer, 'dqss', 'create', function() {
        var permissions = dqs.permissions
        if (permissions !== undefined)
          delete dqs.permissions
        var id = lib.uuid4()
        var selfURL = makeSelfURL(req, id)
        pLib.createPermissionsThen(req, res, selfURL, permissions, function(permissionsURL, permissions, responseHeaders){
          // Create permissions first. If we fail after creating the permissions resource but before creating the main resource, 
          // there will be a useless but harmless permissions document.
          // If we do things the other way around, a dqs without matching permissions could cause problems.
          allocateSpace(req, res, id, selfURL, dqs, function() {
            db.createDQSThen(req, res, id, selfURL, dqs, function(etag) {
              dqs.self = selfURL 
              lib.created(req, res, dqs, dqs.self, etag)
            })
          })
        })
      })
  }
}

function makeSelfURL(req, key) {
  return '//' + req.headers.host + DQSS + key
}

function addCalculatedProperties(req, entity, selfURL) {
  entity.self = selfURL
  entity._permissions = `scheme://authority/permissions?${entity.self}`
  entity._permissions = `scheme://authority/permissions-heirs?${entity.self}`
}

function getDQS(req, res, id) {
  pLib.ifAllowedThen(req, res, makeSelfURL(req, id), '_self', 'read', function() {
    db.withDQSDo(req, res, id, function(dqs , etag) {
      var selfURL = makeSelfURL(req, id)
      addCalculatedProperties(req, dqs, selfURL)
      lib.found(req, res, dqs, etag)
    })
  })
}

function deleteDQS(req, res, id) {
  pLib.ifAllowedThen(req, res, makeSelfURL(req, id), '_self', 'delete', function() {
    lib.sendInternalRequest(req.headers, `/permissions?/customers;${id}`, 'DELETE', null, function (err, clientRes) {
      if (err)
        lib.internalError(res, err)
      else if (clientRes.statusCode == 404)
        lib.notFound(req, res)
      else if (clientRes.statusCode == 200)
        db.deleteDQSThen(req, res, id, function (dqs, etag) {
          var selfURL = makeSelfURL(req, id)
          addCalculatedProperties(req, dqs, selfURL)
          lib.found(req, res, dqs, dqs.etag)
        })
      else
        getClientResponseBody(clientRes, function(body) {
          var err = {statusCode: clientRes.statusCode, msg: `failed to delete permissions for ${resourceURL} statusCode ${clientRes.statusCode} message ${body}`}
          internalError(serverRes, err)
        })
    })
  })
}

function updateDQS(req, res, id, patch) {
  pLib.ifAllowedThen(req, res, makeSelfURL(req, id), '_self', 'update', function(err, reason) {
    db.withDQSDo(req, res, id, function(team , etag) {
      lib.applyPatch(req, res, dqs, patch, function(patchedDQS) {
        db.updateDQSThen(req, res, id, dqs, patchedDQS, etag, function (etag) {
          addCalculatedProperties(req, patchedPermissions, selfURL(id, req)) 
          lib.found(req, res, dqs, etag)
        })
      })
    })
  })
}

function requestHandler(req, res) {
  function handleDQSMethods(id) {
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
  }
  if (req.url == '/dqss') 
    if (req.method == 'POST') 
      lib.getServerPostObject(req, res, createDQS)
    else 
      lib.methodNotAllowed(req, res, ['POST'])
  else {
    var req_url = url.parse(req.url)
    if (req_url.pathname.startsWith(DQSS) && req_url.search == null) 
      handleDQSMethods(req_url.pathname.substring(DQSS.length))
    else if (req_url.pathname.startsWith('/dqss;') && req_url.search == null) 
      db.withDQSFromNameDo(req_url.pathname.split('/')[1].substring('dqss;'.length), function(id) {
        handleDQSMethods(id)
      })
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