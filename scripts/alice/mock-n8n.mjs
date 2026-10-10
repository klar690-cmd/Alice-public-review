import http from 'node:http'
// Deterministic transport endpoint, not an n8n workflow or agent runtime.
const events=[]
const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type')
  res.setHeader('Content-Type','application/json')
  if(req.method==='OPTIONS'){res.writeHead(204).end();return}
  if(req.method==='GET'&&req.url==='/healthz'){res.end(JSON.stringify({status:'ok',fixture:true}));return}
  if(req.method==='GET'&&req.url==='/evidence'){res.end(JSON.stringify({fixture:true,events}));return}
  if(req.method==='POST'&&req.url==='/webhook/alice'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>16384){res.writeHead(413).end();return}}
    try {const event=JSON.parse(body)
      if(event.action!=='connection.test'||event.schema_version!==2||!event.correlation_id||!event.account_id||!event.agent_id||!event.project_id)throw new Error('not a test event')
      events.push(event);if(events.length>100)events.shift()
      res.writeHead(202).end(JSON.stringify({accepted:true,fixture:true,correlation_id:event.correlation_id}))
    }catch{res.writeHead(400).end(JSON.stringify({accepted:false,fixture:true}))}return
  }
  res.writeHead(404).end(JSON.stringify({error:'not_found',fixture:true}))
})
server.listen(1425,'127.0.0.1',()=>console.log('Alice deterministic n8n transport fixture: http://127.0.0.1:1425'))
