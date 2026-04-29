const db = require('./config/db');
const fs = require('fs');
db.query('SELECT * FROM categories').then(([r]) => {
    fs.writeFileSync('cats_dump.json', JSON.stringify(r, null, 2));
    console.log('Dumped ' + r.length + ' categories');
}).catch(err => {
    fs.writeFileSync('cats_error.txt', err.message);
    console.error(err);
}).finally(() => process.exit(0));
