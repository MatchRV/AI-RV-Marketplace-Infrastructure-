 console.log("STARTING");
  var p = new (require("pg").Pool)();
  p.query("UPDATE dealers SET domain='baydos.com' WHERE id=1").then(function() {
    console.log("1 done");
    return p.query("UPDATE dealers SET domain='baydosrvs.com' WHERE id=2");
  }).then(function() {
    console.log("2 done");
    return p.query("UPDATE dealers SET domain='bretzrv.com' WHERE id=3");
  }).then(function() {
    console.log("3 done");
    return p.query("UPDATE dealers SET domain='broadmoorrv.com' WHERE id=4");
  }).then(function() {
    console.log("4 done");
    return p.query("UPDATE dealers SET domain='centralwashingtonrv.com' WHERE id=5");
  }).then(function() {
    console.log("5 done");
    return p.query("UPDATE dealers SET domain='clearviewrv.com' WHERE id=6");
  }).then(function() {
    console.log("6 done");
    return p.query("UPDATE dealers SET domain='clickitrv.com' WHERE id=7");
  }).then(function() {
    console.log("7 done");
    return p.query("UPDATE dealers SET domain='clickitrvuniongap.com' WHERE id=8");
  }).then(function() {
    console.log("8 done");
    return p.query("UPDATE dealers SET domain='clickitrvmoseslake.com' WHERE id=9");
  }).then(function() {
    console.log("9 done");
    return p.query("UPDATE dealers SET domain='countrymotorhomes.com' WHERE id=10");
  }).then(function() {
    console.log("10 done");
    return p.query("UPDATE dealers SET domain='fifervcenter.com' WHERE id=11");
  }).then(function() {
    console.log("11 done");
    return p.query("UPDATE dealers SET domain='johnsonrv.com' WHERE id=12");
  }).then(function() {
    console.log("12 done");
    return p.query("UPDATE dealers SET domain='kitsaprvs.com' WHERE id=13");
  }).then(function() {
    console.log("13 done");
    return p.query("UPDATE dealers SET domain='maplegroverv.com' WHERE id=14");
  }).then(function() {
    console.log("14 done (15 already done)");
    return p.query("UPDATE dealers SET domain='rnrrv.com' WHERE id=16");
  }).then(function() {
    console.log("16 done");
    return p.query("UPDATE dealers SET domain='rvsnorthwest.com' WHERE id=17");
  }).then(function() {
    console.log("17 done");
    return p.query("UPDATE dealers SET domain='seattleairstream.com' WHERE id=18");
  }).then(function() {
    console.log("18 done");
    return p.query("UPDATE dealers SET domain='selkirkrv.com' WHERE id=19");
  }).then(function() {
    console.log("19 done");
    return p.query("UPDATE dealers SET domain='sumnerrv.com' WHERE id=20");
  }).then(function() {
    console.log("20 done");
    return p.query("UPDATE dealers SET domain='tacomarv.com' WHERE id=21");
  }).then(function() {
    console.log("21 done");
    return p.query("UPDATE dealers SET domain='valleyrvsupercenter.com' WHERE id=22");
  }).then(function() {
    console.log("22 done");
    return p.query("UPDATE dealers SET domain='wilderrvs.com' WHERE id=23");
  }).then(function() {
    console.log("23 done");
    return p.query("UPDATE dealers SET domain='apachecamping.com' WHERE id=24");
  }).then(function() {
    console.log("24 done");
    return p.query("UPDATE dealers SET domain='bluecompassrv.com' WHERE id=25");
  }).then(function() {
    console.log("25 done");
    return p.query("SELECT id, name, domain FROM dealers ORDER BY id");
  }).then(function(r) {
    console.log("\nALL DEALERS:");
    r.rows.forEach(function(d) { console.log("  " + d.id + ": " + d.name + " -> " + d.domain); });
    p.end();
  }).catch(function(e) {
    console.error("FAILED:", e.message);
    p.end();
  });
