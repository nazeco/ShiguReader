const _ = require('underscore');
const dateFormat = require('dateformat');

const pathUtil = require("../pathUtil");
const stringHash = require("string-hash");
const path = require('path');
const serverUtil = require("../serverUtil");
const util = global.requireUtil();
const userConfig = global.requireUserConfig();

const { getDirName } = serverUtil;
const { isImage, isCompress, isMusic, isDisplayableInExplorer, isDisplayableInOnebook } = util;
const { generateContentUrl } = pathUtil;

const nameParser = require('../../name-parser');
const namePicker = require("../../human-name-picker");

const loki = require("lokijs");
const file_db = new loki();
const file_collection = file_db.addCollection("fileTable", {
    //warning too many indices will dramatically slow down insert/update 
    indices: ['filePath', "fileName"],
    // indices: ['filePath', "fileName", "tags", "authors"],
    unique: ['filePath']
});

//file path to file stats
let fileToInfo =  {}
    


const cacheDb = module.exports.cacheDb = {
    //a list of cache files folder -> files
    folderToFiles: {},
    //cache path to file stats
    cacheFileToInfo: {}
}

module.exports.getAllFilePathes = function () {
    return _.keys(fileToInfo);
};



const getFileToInfo = module.exports.getFileToInfo = function (filePath) {
    if (filePath) {
        return fileToInfo[filePath];
    } else {
        return fileToInfo;
    }
}

module.exports.getCacheFileToInfo = function () {
    return cacheDb.cacheFileToInfo;
}

module.exports.getAllCacheFilePathes = function () {
    return _.keys(cacheDb.cacheFileToInfo);
}


function getData(filePath) {
    return file_collection.findOne({ filePath: filePath });
}

const has = module.exports.has = function (filePath) {
    const data = getData(filePath);
    return !!data;
}

const deleteFromFileDb = function (filePath) {
    if (has(filePath)) {
        let data = getData(filePath);
        file_collection.remove(data);
    }
}

const sep = serverUtil.sep;

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database(':memory:');
db.run("CREATE TABLE file_table (filePath TEXT, fileName TEXT, isDisplayableInExplorer BOOL, isDisplayableInOnebook BOOL, tags TEXT, authors TEXT, _group TEXT )");

const _util = require('util');
db.allSync = _util.promisify(db.all).bind(db);
db.getSync = _util.promisify(db.get).bind(db);


module.exports.getSQLDB = function(){
    return db;
}

const updateFileDb = function (filePath, insert) {
    const fileName = path.basename(filePath);

    let data = insert ? {} : (getData(filePath) || {});
    data.filePath = filePath;
    data.fileName = fileName;
    data.isDisplayableInExplorer = isDisplayableInExplorer(filePath);
    data.isDisplayableInOnebook = isDisplayableInOnebook(filePath);

    //set up tags
    const str = data.isDisplayableInExplorer ? fileName : getDirName(filePath);

    const temp = nameParser.parse(str) || {};
    const nameTags = namePicker.pick(str) || [];
    const tags1 = temp.tags || [];
    temp.comiket && tags1.concat(temp.comiket);
    const musisTags = nameParser.parseMusicTitle(str) || [];
    let tags = _.uniq(tags1.concat(nameTags, musisTags));

    data.tags = tags.join(sep);
    data.authors = (temp.authors && temp.authors.join(sep)) || temp.author || "";
    data.group = temp.group || "";

    // db.run("INSERT INTO file_table VALUES (?)", 
    // https://www.sqlitetutorial.net/sqlite-nodejs/insert/
    db.run("INSERT INTO file_table(filePath, fileName, isDisplayableInExplorer, isDisplayableInOnebook, tags, authors, _group ) values(?, ?, ?, ?, ?, ?, ? )", 
    data.filePath, data.fileName, 
    data.isDisplayableInExplorer, data.isDisplayableInOnebook, 
    data.tags, temp.author, temp.group);

    if (insert || !has(filePath)) {
        file_collection.insert(data);

    } else {
        file_collection.update(data);
    }
}

module.exports.getFileCollection = function () {
    return file_collection;
}

const pfs = require('promise-fs');
//!! same as file-iterator getStat()
module.exports.updateStatToDb = function (path, stat) {
    const result = {};

    if(!stat){
        //seems only happen on mac
        // console.log(path, "has no stat");

        //todo: mac img folder do not display

        pfs.stat(path).then(stat => {
            result.isFile = stat.isFile();
            result.isDir = stat.isDirectory();
            result.mtimeMs = stat.mtimeMs;
            result.mtime = stat.mtime;
            result.size = stat.size;
            fileToInfo[path] = result;
            updateFileDb(path);
        });
    }else{
        result.isFile = stat.isFile();
        result.isDir = stat.isDirectory();
        result.mtimeMs = stat.mtimeMs;
        result.mtime = stat.mtime;
        result.size = stat.size;
        fileToInfo[path] = result;
        updateFileDb(path);
    }
}

module.exports.deleteFromDb = function (path) {
    delete fileToInfo[path];
    deleteFromFileDb(path);
}

module.exports.getImgFolderInfo = function (imgFolders) {
    const imgFolderInfo = {};
    _.keys(imgFolders).forEach(folder => {
        const files = imgFolders[folder];
        const len = files.length;
        let mtimeMs = 0, size = 0, totalImgSize = 0, pageNum = 0, musicNum = 0;
        files.forEach(file => {
            const tempInfo = getFileToInfo(file);
            if(!tempInfo){
                return;
            }

            mtimeMs += tempInfo.mtimeMs / len;
            size += tempInfo.size;

            if (isImage(file)) {
                totalImgSize += tempInfo.size;
                pageNum++;
            } else if (isMusic(file)) {
                musicNum++;
            }
        })

        //!! same as file-iterator getStat()
        imgFolderInfo[folder] = {
            isFile: false,
            isDir: true,
            mtimeMs,
            mtime: mtimeMs,
            size,
            totalImgSize,
            pageNum,
            musicNum
        };
    })

    return imgFolderInfo;
}

//---------------------------------------------cache db---------------------


//  outputPath is the folder name
module.exports.getCacheFiles = function (outputPath) {
    //in-memory is fast
    const single_cache_folder = path.basename(outputPath);
    if (cacheDb.folderToFiles[single_cache_folder] && cacheDb.folderToFiles[single_cache_folder].length > 0) {
        return generateContentUrl(cacheDb.folderToFiles[single_cache_folder], outputPath);
    }
    return null;
}

module.exports.getCacheOutputPath = function (cachePath, zipFilePath) {
    let outputFolder;
    outputFolder = path.basename(zipFilePath, path.extname(zipFilePath));
    if (!userConfig.readable_cache_folder_name) {
        outputFolder = stringHash(zipFilePath).toString();
    } else {
        outputFolder = outputFolder.replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>/]/gi, '');
    }
    outputFolder = outputFolder.trim();

    let stat = getFileToInfo(zipFilePath);
    if (!stat) {
        //should have stat in fileToInfo
        //but chokidar is not reliable
        //getCacheOutputPath comes before chokidar callback
        console.warn("[getCacheOutputPath] no stat", zipFilePath);
    } else {
        const mdate = new Date(stat.mtimeMs);
        mdate.setMilliseconds(0);
        mdate.setSeconds(0);
        mdate.setMinutes(0);
        mdate.setHours(0);
        const mstr = dateFormat(mdate, "yyyy-mm-dd") // mdate.getTime();
        const fstr = (stat.size / 1000 / 1000).toFixed();
        outputFolder = outputFolder + `${mstr} ${fstr}`;
    }
    return path.join(cachePath, outputFolder);
}

//!! same as file-iterator getStat()
module.exports.updateStatToCacheDb = function (p, stats) {
    const { folderToFiles, cacheFileToInfo } = cacheDb;
    const fp = getDirName(p);
    folderToFiles[fp] = folderToFiles[fp] || [];
    folderToFiles[fp].push(path.basename(p));

    cacheFileToInfo[p] = stats;
}

module.exports.deleteFromCacheDb = function (p) {
    const { folderToFiles, cacheFileToInfo } = cacheDb;
    const fp = getDirName(p);
    if (folderToFiles[fp]) {
        const index = folderToFiles[fp].indexOf(path.basename(p));
        folderToFiles[fp].splice(index, 1);
    }
    delete cacheFileToInfo[p];
}