const fs = require('fs');
const path = require('path');

const filesToDel = [
    'fix_orphaned_mechanics.sql',
    'fix_mechanic_fk.sql',
    'database/add_tracking_columns.sql',
    'fix_fk.bat',
    'tree.txt',
    'server/quick_migrate.sql'
];

const patternsToDel = [
    /^server\/migrate_.*\.js$/,
    /^server\/check_.*\.js$/,
    /^server\/test_.*\.js$/,
    /^server\/debug_.*\.js$/,
    /^server\/final_debug\.js$/,
    /^server\/fix_.*\.js$/,
    /^server\/force_migrate\.js$/,
    /^server\/force_fix_final\.js$/,
    /^server\/setup_staff\.js$/,
    /^server\/check_schema\.php$/,
    /^server\/fix_.*\.php$/,
    /^server\/standalone_test\.js$/
];

const root = process.cwd();

// Delete specific files
filesToDel.forEach(f => {
    const p = path.join(root, f);
    if (fs.existsSync(p)) {
        try {
            fs.unlinkSync(p);
            console.log(`Deleted: ${f}`);
        } catch (e) {
            console.error(`Failed to delete ${f}: ${e.message}`);
        }
    }
});

// Delete patterned files in server/
const serverDir = path.join(root, 'server');
if (fs.existsSync(serverDir)) {
    fs.readdirSync(serverDir).forEach(f => {
        const relPath = path.join('server', f);
        if (patternsToDel.some(re => re.test(relPath))) {
            const p = path.join(serverDir, f);
            try {
                fs.unlinkSync(p);
                console.log(`Deleted: ${relPath}`);
            } catch (e) {
                console.error(`Failed to delete ${relPath}: ${e.message}`);
            }
        }
    });
}
