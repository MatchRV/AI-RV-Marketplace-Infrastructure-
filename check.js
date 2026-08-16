const p = new (require("pg").Pool)();
  const q = "SELECT column_name FROM information_schema.columns WHERE table_name='dealers'";
  p.query(q).then(r => {
    console.log("DEALERS:", r.rows.map(x => x.column_name));
    return p.query("SELECT COUNT(*) FROM dealers");
  }).then(r => {
    console.log("DEALER COUNT:", r.rows[0].count);
    return p.query("SELECT COUNT(*) FROM listings");
  }).then(r => {
    console.log("LISTING COUNT:", r.rows[0].count);
    p.end();
  }).catch(e => { console.error(e.message); p.end(); });
