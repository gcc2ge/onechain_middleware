'use strict';
var  express=require('express');
var app=express();
var bodyParser=require('body-parser');

app.set('port',process.env.PORT || 8080);

// app.use(express.favicon());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));
// app.use(express.methodOverride());
// app.use(app.router)






var log4js = require('log4js');
var logger = log4js.getLogger('DEPLOY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');

var config = require('./config.json');
var helper = require('../helper.js');

logger.setLevel('DEBUG');

var client = new hfc();
var chain;
var eventhub;
var tx_id = null;

var user;

init();

function init() {
	chain = client.newChain(config.chainName);
	chain.addOrderer(new Orderer(config.orderer.orderer_url));
	eventhub = new EventHub();
	eventhub.setPeerAddr(config.events[0].event_url);
	eventhub.connect();
	for (var i = 0; i < config.peers.length; i++) {
		chain.addPeer(new Peer(config.peers[i].peer_url));
	}
}


hfc.newDefaultKeyValueStore({
	path: config.keyValueStore
}).then(function(store) {
	client.setStateStore(store);
	return helper.getSubmitter(client);
}).then(
	function(admin) {
		user=admin;
		app.listen(app.get('port'));
	}
).catch(
	function(err) {
		eventhub.disconnect();
		logger.error('Failed to invoke transaction due to error: ' + err.stack ? err.stack : err);
	}
);

app.post('/write',(req,resp) => {
	console.info(req.body);
	var id=req.id;
	var project_id=req.body.project_id;
	var fundraiser_id=req.body.fundraiser_id;
	var use_pople=req.body.use_pople;
	var use_type=req.body.use_type;
	var use_nums=req.body.use_nums;
	var use_dt=req.body.use_dt;
	var use_desc=req.body.use_desc;
	var bills=req.body.bills;
	var bills_abstract=req.body.bills_abstract;
	var createdt=req.body.createdt;
	var modifydt=req.body.modifydt;

	logger.info('Successfully obtained user to submit transaction');

	logger.info('Executing Invoke');
	tx_id = helper.getTxId();
	var nonce = utils.getNonce();
	// var args = helper.getArgs(config.invokeRequest.args);
	var args=[
        "write",
        id,
		project_id,
		fundraiser_id,
		use_pople,
		use_type,
		use_nums,
		use_dt,
		use_desc,
		bills,
		bills_abstract,
		createdt,
		modifydt
      ];
	// send proposal to endorser
	var request = {
		chaincodeId: config.chaincodeID,
		fcn: config.invokeRequest.functionName,
		args: args,
		chainId: config.channelID,
		txId: tx_id,
		nonce: nonce
	};
	chain.sendTransactionProposal(request)
	.then(
		function(results) {
			logger.info('Successfully obtained proposal responses from endorsers');

			return helper.processProposal(chain, results, 'write');
		}
	)
	.then(
		function(response) {
			if (response.status === 'SUCCESS') {
				var handle = setTimeout(() => {
					logger.error('Failed to receive transaction notification within the timeout period');
					resp.send('Failed to receive transaction notification within the timeout period');
				}, parseInt(config.waitTime));

				eventhub.registerTxEvent(tx_id.toString(), (tx) => {
					logger.info('The chaincode transaction has been successfully committed');
					clearTimeout(handle);
					eventhub.disconnect();
					resp.send('The chaincode transaction has been successfully committed')
				});
			}
		}
	).catch(
		function(err) {
			eventhub.disconnect();
			resp.json(err.toString('utf8'));
		}
	)
});

app.get('/queryFund',(req,resp) => {
	console.info(req.query.id);
	
	var id=req.query.id

	logger.info('Successfully obtained enrolled user to perform query');

	logger.info('Executing Query');
	var targets = [];
	for (var i = 0; i < config.peers.length; i++) {
		targets.push(config.peers[i]);
	}
	// var args = helper.getArgs(config.queryRequest.args);
	var args=[
         "queryFund",
         id
      ];
	//chaincode query request
	var request = {
		targets: targets,
		chaincodeId: config.chaincodeID,
		chainId: config.channelID,
		txId: utils.buildTransactionID(),
		nonce: utils.getNonce(),
		fcn: config.queryRequest.functionName,
		args: args
	};
	// Query chaincode
	chain.queryByChaincode(request)
	.then(
		function(response_payloads) {
			for (let i = 0; i < response_payloads.length; i++) {
				logger.info('############### Query results after the move on PEER%j, User "b" now has  %j', i, response_payloads[i].toString('utf8'));
			}
			resp.json(response_payloads[0].toString('utf8'));
		}
	)
	.catch(err => {
		resp.json(err.toString('utf8'));
	})
	
});

app.get("/getFundByIds",(req,resp) => {
	var ids=req.query.id || '';
	ids=ids.split(',');
	console.info(ids);
	var l=ids.length;
	var rts=[];
	ids.forEach((item,index) =>{
		getFundById(item)
		.then(str =>{
			resp.write(str);
		});
	});
	console.info(rts);
	resp.json(rts);

});

function getFundById(id){

	var targets = [];
	for (var i = 0; i < config.peers.length; i++) {
		targets.push(config.peers[i]);
	}
	// var args = helper.getArgs(config.queryRequest.args);
	var args=[
         "queryFund",
         id
      ];
	//chaincode query request
	var request = {
		targets: targets,
		chaincodeId: config.chaincodeID,
		chainId: config.channelID,
		txId: utils.buildTransactionID(),
		nonce: utils.getNonce(),
		fcn: config.queryRequest.functionName,
		args: args
	};
	// Query chaincode
	chain.queryByChaincode(request)
	.then(
		function(response_payloads) {
			for (let i = 0; i < response_payloads.length; i++) {
				logger.info('############### Query results after the move on PEER%j, User "b" now has  %j', i, response_payloads[i].toString('utf8'));
			}
			return response_payloads[0].toString('utf8');
		}
	)
	.catch(err => {
		return "";
	})
}

app.get('/write_get',(req,resp) =>{
	var str=req.query.str || "";

	var queryStr = new Buffer(str, 'base64').toString();
	console.info(queryStr);

	var queryJson=JSON.parse(queryStr);

	var id=queryJson.id || "";
	var project_id=queryJson.project_id || "";
	var fundraiser_id=queryJson.fundraiser_id || "";
	var use_pople=queryJson.use_pople || "";
	var use_type=queryJson.use_type || "";
	var use_nums=queryJson.use_nums || "";
	var use_dt=queryJson.use_dt || "";
	var use_desc=queryJson.use_desc || "";
	var bills=queryJson.bills || "";
	var bills_abstract=queryJson.bills_abstract || "";
	var createdt=queryJson.createdt || "";
	var modifydt=queryJson.modifydt || "";

	logger.info("json ............")
	logger.info(queryJson);

	logger.info('Successfully obtained user to submit transaction');

	logger.info('Executing Invoke');
	tx_id = helper.getTxId();
	var nonce = utils.getNonce();
	// var args = helper.getArgs(config.invokeRequest.args);
	var args=[
        "write",
        '"'+id+'"',
		'"'+project_id+'"',
		'"'+fundraiser_id+'"',
		'"'+use_pople+'"',
		'"'+use_type+'"',
		'"'+use_nums+'"',
		'"'+use_dt+'"',
		'"'+use_desc+'"',
		'"'+bills+'"',
		'"'+bills_abstract+'"',
		'"'+createdt+'"',
		'"'+modifydt+'"'
      ];

	// send proposal to endorser
	var request = {
		chaincodeId: config.chaincodeID,
		fcn: config.invokeRequest.functionName,
		args: args,
		chainId: config.channelID,
		txId: tx_id,
		nonce: nonce
	};
	chain.sendTransactionProposal(request)
	.then(
		function(results) {
			logger.info('Successfully obtained proposal responses from endorsers');

			return helper.processProposal(chain, results, 'write');
		}
	)
	.then(
		function(response) {
			if (response.status === 'SUCCESS') {
				var handle = setTimeout(() => {
					logger.error('Failed to receive transaction notification within the timeout period');
					resp.send('Failed to receive transaction notification within the timeout period');
				}, parseInt(config.waitTime));

				eventhub.registerTxEvent(tx_id.toString(), (tx) => {
					logger.info('The chaincode transaction has been successfully committed');
					clearTimeout(handle);
					eventhub.disconnect();
					resp.send('The chaincode transaction has been successfully committed')
				});
			}
		}
	).catch(
		function(err) {
			eventhub.disconnect();
			resp.json(err.toString('utf8'));
		}
	)

});