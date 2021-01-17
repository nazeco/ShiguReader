const _ = require('underscore');
const dateFormat = require('dateformat');

const pathUtil = require("../pathUtil");
const stringHash = require("string-hash");
const path = require('path');
const serverUtil = require("../serverUtil");
const util = global.requireUtil();
const userConfig = global.requireUserConfig();

const { getDirName } = serverUtil;
const { isImage, isCompress, isMusic } = util;
const { generateContentUrl } = pathUtil;

const nameParser = require('../../name-parser');
const namePicker = require("../../human-name-picker");

const rootPath = pathUtil.getRootPath();


let history_db_path = path.join(rootPath, userConfig.workspace_name, "history_sql_db");
var sqlite3 = require('sqlite3').verbose();
var sqlDb = new sqlite3.Database(history_db_path);
sqlDb.run("CREATE TABLE IF NOT EXISTS history_table (filePath TEXT, dirPath TEXT, fileName TEXT, time INTEGER)");


const _util = require('util');
sqlDb.allSync = _util.promisify(sqlDb.all).bind(sqlDb);
sqlDb.getSync = _util.promisify(sqlDb.get).bind(sqlDb);
sqlDb.runSync = _util.promisify(sqlDb.run).bind(sqlDb);

module.exports.getSQLDB = function(){
    return sqlDb;
}

module.exports.addOneRecord = function (filePath) {
    const time = util.getCurrentTime()
    const fileName = path.basename(filePath);
    const dirPath = path.dirname(filePath);

    sqlDb.run("INSERT OR REPLACE INTO history_table(filePath, dirPath, fileName, time ) values(?, ?, ?, ?)", 
    filePath, dirPath, fileName, time);
}

const back_days = 5;
module.exports.getHistory = async function(){
    let time = util.getCurrentTime();
    time = time - 1000 * 3600 * 24 * back_days;
    let rows = await sqldb.allSync("SELECT filePath, MAX(time) FROM history_table where time > ? GROUP BY filePath", [time]);
    return rows;
}