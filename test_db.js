console.log('Starting script...');
const db = require('./config/db');
console.log('DB required...');
db.query('SELECT 1').then(() => {
    console.log('Query successful');
    process.exit(0);
}).catch(err => {
    console.error('Query failed', err);
    process.exit(1);
});
