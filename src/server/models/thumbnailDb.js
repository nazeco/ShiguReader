const path = require('path');
const _ = require('underscore');
const serverUtil = require("../serverUtil");
const userConfig = global.requireUserConfig();

const pathUtil = require("../pathUtil");
const rootPath = pathUtil.getRootPath();

let thumbnail_db_path = path.join(rootPath, userConfig.workspace_name, "thumbnail_sql_db");
var sqlite3 = require('sqlite3').verbose();
var sqlDb = new sqlite3.Database(thumbnail_db_path);
sqlDb.run("CREATE TABLE IF NOT EXISTS thumbnail_table (filePath TEXT, thumbnailFileName TEXT)");

const _util = require('util');
sqlDb.allSync = _util.promisify(sqlDb.all).bind(sqlDb);
sqlDb.getSync = _util.promisify(sqlDb.get).bind(sqlDb);
sqlDb.runSync = _util.promisify(sqlDb.run).bind(sqlDb);

function addNewThumbnail(filePath, thumbnailFilePath) {
    const thumbnailFileName = path.basename(thumbnailFilePath);
    sqlDb.run("INSERT OR REPLACE INTO thumbnail_table(filePath, thumbnailFileName ) values(?, ?)", filePath, thumbnailFileName);
}

function init(filePathes) {
    // filePathes.forEach(e => {
    //     addNewThumbnail(e);
    // })

    //todo iterate all thumbnail 
    //if the real file is delete
    //remove sql table
}


function _add_col(rows){
    thumbnailFolderPath = global.thumbnailFolderPath;
    rows.forEach(row => {
        row.thumbnailFilePath = path.resolve(thumbnailFolderPath, row.thumbnailFileName)
    })
    return rows;
}

//multiple
async function getThumbnailArr(filePathes){
    const joinStr = filePathes.join(" ");
    sql = `SELECT * FROM  thumbnail_table WHERE INSTR(?, filePath)`;
    let rows = await sqlDb.allSync(sql, [joinStr]);
    return _add_col(rows);
}

//single file
async function getThumbnail(filePath) {
    sql = `SELECT * FROM  thumbnail_table WHERE filePath = ?`;
    let rows = await sqlDb.allSync(sql, [filePath]);
    _add_col(rows)
    return rows[0] && rows[0].thumbnailFileName;
}

async function getThumbCount() {
    sql = `SELECT COUNT(*) as count FROM  thumbnail_table`;
    const rows = await sqlDb.allSync(sql);
    return rows[0].count;
}

module.exports = {
    addNewThumbnail,
    init,
    getThumbnailArr,
    getThumbnail,
    getThumbCount,
};