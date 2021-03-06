// The MIT License

// Copyright 2020 Daniel Diment Rodríguez https://dandimrod.dev

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/**
 * Class that represents a single IndexSQL database
 * @constructor
 * @param  {String} dbName - The name of the database you want to open.
 */
export default class IndexSQL {
    constructor(dbName) {
        let db = {};
        let requestDB = indexedDB.open("IndexSQL", 1);
        requestDB.onerror = function(event) {
            log.warn("Database error: " + event.target.errorCode);
        };
        requestDB.onupgradeneeded = function(event) {
            db = event.target.result;
            let store = db.createObjectStore("databases", { keypath: "name" });
        };
        db.server = function() {
            let data = {};
            var DBUtils = {
                name: "",
                loaded: false,
                transaction: false,
                save: function() {
                    let requestDB = indexedDB.open("IndexSQL", 1);
                    requestDB.onerror = function(event) {
                        log.warn("Database error: " + event.target.errorCode);
                    };
                    requestDB.onsuccess = function(event) {
                        let db = event.target.result;
                        let transaction = db.transaction(["databases"], "readwrite");
                        transaction.onerror = function(event) {
                            console.warn("Database error: " + event.target.errorCode);
                        };
                        transaction.oncomplete = function(event) {
                            //SAVED
                        };
                        var objectStore = transaction.objectStore("databases");
                        var request = objectStore.put({ data: JSON.stringify(data) }, DBUtils.name);
                    };
                },
                load: function() {
                    let requestDB = indexedDB.open("IndexSQL", 1);
                    requestDB.onerror = function(event) {
                        log.warn("Database error: " + event.target.errorCode);
                    };
                    requestDB.onsuccess = function(event) {
                        let db = event.target.result;
                        let transaction = db.transaction(["databases"], "readonly");
                        transaction.onerror = function(event) {
                            console.warn("Database error: " + event.target.errorCode);
                        };
                        transaction.oncomplete = function(event) {
                            if (request.result) {
                                data = JSON.parse(request.result.data);
                            } else {
                                DBUtils.save();
                            }
                            DBUtils.loaded = true;
                        };
                        var objectStore = transaction.objectStore("databases");
                        var request = objectStore.get(DBUtils.name);
                    };
                },
                drop: function() {
                    let requestDB = indexedDB.open("IndexSQL", 1);
                    requestDB.onerror = function(event) {
                        log.warn("Database error: " + event.target.errorCode);
                    };
                    requestDB.onsuccess = function(event) {
                        let db = event.target.result;
                        let transaction = db.transaction(["databases"], "readwrite");
                        transaction.onerror = function(event) {
                            console.warn("Database error: " + event.target.errorCode);
                        };
                        transaction.oncomplete = function(event) {
                            console.log("Database " + DBUtils.name + " has been dropped");
                            postMessage({ end: true });
                        };
                        var objectStore = transaction.objectStore("databases");
                        var request = objectStore.delete(DBUtils.name);
                    };
                }
            };
            var SQLParser = {
                parse: function(querys, id) {
                    //Delete all comments
                    querys = querys.replace(/(?:\/\*(?:.|\n)*?\*\/|--.*)/g, "");
                    if (DBUtils.loaded) {
                        postMessage({ id, response: SQLParser.parseAll(querys) });
                    } else {
                        setTimeout(function(querys, id) {
                            return function() {
                                SQLParser.parse(querys, id);
                            };
                        }(querys, id), 500);
                    }
                },
                parseAll: function(querys) {
                    querys = querys.split(";\n");
                    let response = [];
                    for (let index = 0; index < querys.length; index++) {
                        const query = querys[index].trim();
                        if(query===''){
                            continue;
                        }
                        response[index] = this.parser(query);
                        if (response[index].result) {
                            if (response[index].order) {
                                response[index].result = tables.transform(response[index].result, response[index].distinct, response[index].order);
                                delete response[index].order;
                                delete response[index].distinct;
                            } else {
                                response[index].result = tables.transform(response[index].result, response[index].distinct);
                                delete response[index].distinct;
                            }
                        }
                        if (DBUtils.transaction) {
                            if (response[index].error) {
                                data = {};
                                DBUtils.loaded = false;
                                DBUtils.load();
                                response[index].error = response[index].error + ". Transaction cancelled";
                                break;
                            }
                        }
                    }
                    return response;
                },
                parser: function(query) {
                    query = query.replace(/(\r\n|\n|\r)/gm, " ").trim();
                    let operation = query.split(" ")[0].toUpperCase();
                    switch (operation) {
                        case "SELECT":
                            return this.select(query);
                        case "INSERT":
                            return this.insert(query);
                        case "CREATE":
                            return this.create(query);
                        case "UPDATE":
                            return this.update(query);
                        case "DELETE":
                            return this.delete(query);
                        case "DROP":
                            return this.drop(query);
                        case "TRUNCATE":
                            return this.trucate(query);
                        case "START":
                            return this.start(query);
                        case "END":
                            return this.end(query);
                        case "TABLES":
                            return this.tables(query);
                        default:
                            return { error: "Not supported operation" };
                    }
                },
                select: function(query) {
                    function getFrom(fromStatement) {
                        let keywords = ["where", "order"];
                        let fromMatches = { from: "", where: "", order: "" };
                        let dividedFrom = fromStatement.split(" ");
                        let lastMatch = "from";
                        for (let index = 0; index < dividedFrom.length; index++) {
                            const element = dividedFrom[index];
                            if (keywords.includes(element.toLowerCase())) {
                                lastMatch = element.toLowerCase();
                            } else {
                                fromMatches[lastMatch] = fromMatches[lastMatch] + " " + element;
                            }
                        }
                        fromMatches.from = fromMatches.from.trim();
                        fromMatches.where = fromMatches.where !== "" ? fromMatches.where.trim() : undefined;
                        fromMatches.order = fromMatches.order !== "" ? fromMatches.order.trim() : undefined;
                        fromMatches.order = fromMatches.order ? fromMatches.order.substring(3) : undefined;
                        return fromMatches;
                    }

                    function getColumns(matches, table) {
                        let columns;
                        if (matches.columns.trim() === "*") {
                            columns = [];
                            Object.keys(table).forEach(function(element) {
                                columns.push(element.split(";")[0]);
                            });
                        } else {
                            columns = matches.columns.split(",");
                            for (let index = 0; index < columns.length; index++) {
                                columns[index] = columns[index].trim();
                            }
                            //Detects if the table contains the columns
                            for (let index = 0; index < columns.length; index++) {
                                const element = columns[index];
                                if (element.split(".")[1]) {
                                    let foreingTable = tables.find(data, element.split(".")[0]);
                                    if (!foreingTable) {
                                        return { error: "The table " + element.split(".")[0] + " doesn't exist" };
                                    }
                                    if (!tables.find(foreingTable, element.split(".")[1])) {
                                        return { error: "The column " + element.split(".")[1] + " does not belong to the table " + element.split(".")[0] };
                                    }
                                } else {
                                    if (!tables.find(table, element)) {
                                        return { error: "The column " + element + " does not belong to the table " + matches.from };
                                    }
                                }
                            }
                        }
                        return columns;
                    }

                    function getOrder(matches, table) {
                        let result = [];
                        let orders = matches.order.split(",");
                        for (let index = 0; index < orders.length; index++) {
                            const element = orders[index].trim();
                            let desc = false;
                            if (!tables.find(table, element.split(" ")[0])) {
                                return { error: "The column " + element.split(" ")[0] + " does not belong to the table" };
                            }
                            if (element.split(" ")[1]) {
                                if (element.split(" ")[1].toUpperCase() === "DESC") {
                                    desc = true;
                                }
                            }
                            result.push({ name: element.split(" ")[0], desc: desc });
                        }
                        return result;
                    }
                    let selectRegex = /^SELECT\s*(?<distinct>DISTINCT)?\s*(?<columns>.*)\s*FROM(?<from>.*)$/gmi;
                    let matches = selectRegex.exec(query);
                    if (!matches) {
                        return { error: "Not supported operation" };
                    }
                    matches = matches.groups;
                    let matchesFrom = getFrom(matches.from.trim());
                    matches.from = matchesFrom.from;
                    matches.where = matchesFrom.where;
                    matches.order = matchesFrom.order;
                    let table = tables.find(data, matches.from);
                    if (!table) {
                        return { error: "This table doesn't exists" };
                    }
                    let columns = getColumns(matches, table);
                    if (columns.error) {
                        return columns;
                    }
                    let where;
                    if (matches.where) {
                        where = tables.where(matches.where, table);
                        if (where.error) {
                            return where;
                        }
                    }
                    let distinct = false;
                    if (matches.distinct) {
                        distinct = true;
                    }
                    let result = {};
                    //This clones the table into a new table
                    let myTable = JSON.parse(JSON.stringify(table));
                    if (where) {
                        for (const key in myTable[Object.keys(myTable)[0]]) {
                            if (myTable[Object.keys(myTable)[0]].hasOwnProperty(key)) {
                                try {
                                    if (!eval(where)) {
                                        for (const column in myTable) {
                                            if (myTable.hasOwnProperty(column)) {
                                                delete myTable[column][key];
                                            }
                                        }
                                    }
                                } catch (error) {
                                    return { error: "Incorrect where statement" };
                                }
                            }
                        }
                    }
                    for (const key in myTable) {
                        if (myTable.hasOwnProperty(key)) {
                            const element = myTable[key];
                            if (columns.includes(key.split(";")[0])) {
                                result[key] = element;
                            }
                        }
                    }
                    if (matches.order) {
                        let order = getOrder(matches, table);
                        if (order.error) {
                            return order;
                        }
                        return { result: result, distinct: distinct, order: order };
                    } else {
                        return { result: result, distinct: distinct };
                    }
                },
                insert: function(query) {
                    let insertRegex = /^INSERT\s*INTO\s*(?<tableName>\w*)\s*(?:\((?<columns>.*)\))?\s*VALUES\s*\((?<values>.*)\)\s*$/gmi;
                    let matches = insertRegex.exec(query);
                    if (matches === null) {
                        return { error: "Not supported operation" };
                    }
                    matches = matches.groups;
                    let table = tables.find(data, matches.tableName);
                    if (!table) {
                        return { error: "This table doesn't exists" };
                    }
                    let columnOrder = [];
                    if (matches.columns) {
                        let columns = matches.columns.split(",");
                        columns.forEach(element => {
                            columnOrder.push(element.trim());
                        });
                    } else {
                        for (const key in table) {
                            if (table.hasOwnProperty(key)) {
                                columnOrder[key.split(";")[1]] = key.split(";")[0];
                            }
                        }
                    }
                    let values = this.getValues(matches.values);
                    for (let index = 0; index < values.length; index++) {
                        values[index] = values[index].trim();
                    }
                    let result = tables.insert(matches.tableName, table, values, columnOrder);
                    if (result.error) {
                        return result;
                    }
                    if (!DBUtils.transaction) {
                        DBUtils.save();
                    }
                    return result;
                },
                update: function(query) {
                    function getSet(setStatement) {
                        let keywords = ["where"];
                        let setMatches = { set: "", where: "" };
                        let dividedSet = setStatement.split(" ");
                        let lastMatch = "set";
                        for (let index = 0; index < dividedSet.length; index++) {
                            const element = dividedSet[index];
                            if (keywords.includes(element.toLowerCase())) {
                                lastMatch = element.toLowerCase();
                            } else {
                                setMatches[lastMatch] = setMatches[lastMatch] + " " + element;
                            }
                        }
                        setMatches.set = setMatches.set.trim();
                        setMatches.where = setMatches.where !== "" ? setMatches.where.trim() : undefined;
                        return setMatches;
                    }

                    function getValues(values, table) {
                        let result = {};
                        for (let index = 0; index < values.length; index++) {
                            const element = values[index];
                            let columnName = tables.finder(table, element.split("=")[0].trim());
                            if (!columnName) {
                                return { error: "The column " + element.split("=")[0].trim() + " does not belong to the table" };
                            }
                            let columnData = element.split("=")[1].trim();
                            result[columnName] = columnData;
                        }
                        return result;
                    }
                    let updateRegex = /^UPDATE\s*(?<tableName>.*)\s*SET(?<set>.*)$/gmi;
                    let matches = updateRegex.exec(query);
                    if (!matches) {
                        return { error: "Not supported operation" };
                    }
                    matches = matches.groups;
                    let matchesSet = getSet(matches.set.trim());
                    matches.set = matchesSet.set;
                    matches.where = matchesSet.where;
                    matches.tableName = matches.tableName.trim();
                    let table = tables.find(data, matches.tableName.trim());
                    if (!table) {
                        return { error: "This table doesn't exists" };
                    }
                    let values = getValues(this.getValues(matches.set), table);
                    let columnsAffected = Object.keys(values);
                    if (values.error) {
                        return values;
                    }
                    let where;
                    if (matches.where) {
                        where = tables.where(matches.where, table);
                        if (where.error) {
                            return where;
                        }
                    }
                    let indexExecuted = 0;
                    let error;
                    let myTable = table;
                    for (const key in table[Object.keys(table)[0]]) {
                        if (table[Object.keys(table)[0]].hasOwnProperty(key)) {
                            if (where) {
                                try {
                                    if (eval(where)) {
                                        indexExecuted++;
                                        let columns = [];
                                        let insertValues = [];
                                        for (const column in table) {
                                            if (table.hasOwnProperty(column)) {
                                                const element = table[column][key];
                                                columns.push(column.split(";")[0]);
                                                if (columnsAffected.includes(column)) {
                                                    insertValues.push(values[column]);
                                                } else {
                                                    if (typeof element === "string") {
                                                        insertValues.push("'" + element + "'");
                                                    } else {
                                                        insertValues.push(element);
                                                    }
                                                }
                                            }
                                        }
                                        let response = tables.insert(matches.tableName, table, this.getValues(insertValues.join()), columns, key);
                                        if (response.error) {
                                            error = response;
                                            break;
                                        }
                                    }
                                } catch (error) {
                                    return { error: "Incorrect where statement" };
                                }
                            } else {
                                indexExecuted++;
                                let columns = [];
                                let insertValues = [];
                                for (const column in table) {
                                    if (table.hasOwnProperty(column)) {
                                        const element = table[column][key];
                                        columns.push(column.split(";")[0]);
                                        if (columnsAffected.includes(column)) {
                                            insertValues.push(values[column]);
                                        } else {
                                            if (typeof element === "string") {
                                                insertValues.push("'" + element + "'");
                                            } else {
                                                insertValues.push(element);
                                            }
                                        }
                                    }
                                }
                                let response = tables.insert(matches.tableName, table, insertValues.join().split(","), columns, key);
                                if (response.error) {
                                    error = response;
                                    break;
                                }
                            }
                        }
                    }
                    if (error) {
                        return error;
                    } else {
                        return { message: "Updated " + indexExecuted + " rows" };
                    }
                },
                delete: function(query) {
                    function getFrom(fromStatement) {
                        let keywords = ["where"];
                        let fromMatches = { from: "", where: "", order: "" };
                        let dividedFrom = fromStatement.split(" ");
                        let lastMatch = "from";
                        for (let index = 0; index < dividedFrom.length; index++) {
                            const element = dividedFrom[index];
                            if (keywords.includes(element.toLowerCase())) {
                                lastMatch = element.toLowerCase();
                            } else {
                                fromMatches[lastMatch] = fromMatches[lastMatch] + " " + element;
                            }
                        }
                        fromMatches.from = fromMatches.from.trim();
                        fromMatches.where = fromMatches.where !== "" ? fromMatches.where.trim() : undefined;
                        return fromMatches;
                    }
                    let deleteRegex = /^DELETE\s*FROM\s*(?<from>.*)$/gmi;
                    let matches = deleteRegex.exec(query);
                    if (!matches) {
                        return { error: "Not supported operation" };
                    }
                    matches = matches.groups;
                    let matchesFrom = getFrom(matches.from.trim());
                    matches.from = matchesFrom.from;
                    matches.where = matchesFrom.where;
                    let table = tables.find(data, matches.from);
                    if (!table) {
                        return { error: "This table doesn't exists" };
                    }
                    let where;
                    if (matches.where) {
                        where = tables.where(matches.where, table);
                        if (where.error) {
                            return where;
                        }
                    }
                    let myTable = table;
                    let indexExecuted = 0;
                    for (const key in table[Object.keys(table)[0]]) {
                        if (table[Object.keys(table)[0]].hasOwnProperty(key)) {
                            if (where) {
                                try {
                                    if (eval(where)) {
                                        indexExecuted++;
                                        for (const column in table) {
                                            if (table.hasOwnProperty(column)) {
                                                delete table[column][key];
                                            }
                                        }
                                    }
                                } catch (error) {
                                    return { error: "Incorrect where statement" };
                                }
                            } else {
                                indexExecuted++;
                                for (const column in table) {
                                    if (table.hasOwnProperty(column)) {
                                        delete table[column][key];
                                    }
                                }
                            }
                        }
                    }
                    if (!DBUtils.transaction) {
                        DBUtils.save();
                    }
                    return { message: "Deleted " + indexExecuted + " rows" };
                },
                create: function(query) {
                    function getParameters(parameters) {
                        //DELETE PARENTHESIS
                        parameters = parameters.slice(1, -1);
                        let result = { keys: { primary: "", foreign: [] }, parameters: [] };
                        let inlineConstraints = ["NOT_NULL", "UNIQUE", "DEFAULT", "AUTO_INCREMENT", "CHECK"];
                        let datatypes = ["STRING", "NUMBER", "BOOLEAN"];
                        let parametersBreak = parameters.split(",");
                        for (let index = 0; index < parametersBreak.length; index++) {
                            const parameterString = parametersBreak[index].trim();
                            if (parameterString.toUpperCase().includes("KEY")) {
                                if (parameterString.toUpperCase().includes("PRIMARY")) {
                                    let primaryRegex = /^PRIMARY\s*KEY\s*\((?<varName>.*)\)$/gmi;
                                    let key = primaryRegex.exec(parameterString).groups["varName"].trim();
                                    if (result.parameters.find(function(a) { return a.name === key /**&&  a.datatype === "NUMBER"*/ ; })) {
                                        result.keys.primary = key;
                                    } else {
                                        return { error: "PRIMARY KEY does not exist" };
                                    }
                                } else {
                                    let foreingRegex = /^^FOREIGN\s*KEY\s*\((?<varName>.*)\)\s*REFERENCES\s*(?<referTable>.*)\((?<referName>.*)\)$/gmi;
                                    let groups = foreingRegex.exec(parameterString).groups;
                                    groups.varName = groups.varName.trim();
                                    groups.referTable = groups.referTable.trim();
                                    groups.referName = groups.referName.trim();
                                    if (!result.parameters.find(function(a) { return a.name === groups["varName"] /**&& a.datatype === "NUMBER"*/ ; })) {
                                        return { error: "FOREIGN KEY does not exist" };
                                    }
                                    if (!tables.find(tables.find(data, groups["referTable"]), groups["referName"])) {
                                        return { error: "FOREIGN KEY does not exist in foreign table" };
                                    }
                                    result.keys.foreign.push(groups.varName + ":" + groups.referTable + "(" + groups.referName + ")");
                                }
                            } else {
                                let parameterBreak = parameterString.split(" ");
                                let parameter = {
                                    name: parameterBreak[0]
                                };
                                let datatype = transformDatatypes(parameterBreak[1].toUpperCase());
                                if (datatypes.includes(datatype)) {
                                    parameter.datatype = datatype;
                                } else {
                                    return { error: "Parameter " + parameterBreak[0] + " has a non valid datatype" };
                                }
                                for (let index = 2; index < parameterBreak.length; index++) {
                                    parameter.constraints = "";
                                    const element = parameterBreak[index];
                                    if (inlineConstraints.includes(element.toUpperCase())) {
                                        switch (element.toUpperCase()) {
                                            case "NOT_NULL":
                                                parameter.constraints = parameter.constraints + "NOT NULL,";
                                                break;
                                            case "UNIQUE":
                                                parameter.constraints = parameter.constraints + "UNIQUE,";
                                                break;
                                            case "AUTO_INCREMENT":
                                                if (parameter.datatype !== "NUMBER") {
                                                    return { error: "The parameter " + parameter.name + " is set to AUTO_INCREMENT but is not type NUMBER" };
                                                }
                                                parameter.constraints = parameter.constraints + "AUTO_INCREMENT,";
                                                break;
                                            case "DEFAULT":
                                                let defaultCase = [];
                                                for (let index2 = index; index2 < parameterBreak.length; index2++) {
                                                    const element = parameterBreak[index2];
                                                    if (inlineConstraints.includes(element.toUpperCase())) {
                                                        break;
                                                    } else {
                                                        defaultCase.push(element);
                                                    }
                                                }
                                                parameter.constraints = parameter.constraints + "DEFAULT " + defaultCase.join(" ") + ",";
                                                break;
                                            case "CHECK":
                                                let checkCase = [];
                                                for (let index2 = index; index2 < parameterBreak.length; index2++) {
                                                    const element = parameterBreak[index2];
                                                    if (inlineConstraints.includes(element.toUpperCase())) {
                                                        break;
                                                    } else {
                                                        checkCase.push(element);
                                                    }
                                                }
                                                parameter.constraints = parameter.constraints + "CHECK " + checkCase.join(" ") + ",";
                                                break;
                                            default:
                                                break;
                                        }
                                    }
                                }
                                result.parameters.push(parameter);
                            }
                        }
                        return result;
                    }

                    function transformDatatypes(datatype) {
                        //STRING
                        if (datatype.includes("CHAR")) {
                            return "STRING";
                        }
                        if (datatype.includes("BINARY")) {
                            return "STRING";
                        }
                        if (datatype.includes("TEXT")) {
                            return "STRING";
                        }
                        if (datatype.includes("BLOB")) {
                            return "STRING";
                        }
                        //NUMBER
                        if (datatype.includes("BIT")) {
                            return "NUMBER";
                        }
                        if (datatype.includes("INT")) {
                            return "NUMBER";
                        }
                        if (datatype.includes("FLOAT")) {
                            return "NUMBER";
                        }
                        if (datatype.includes("DOUBLE")) {
                            return "NUMBER";
                        }
                        if (datatype.includes("DEC")) {
                            return "NUMBER";
                        }
                        //BOOLEAN
                        if (datatype.includes("BOOL")) {
                            return "BOOLEAN";
                        }
                        return datatype;
                    }
                    let createRegex = /^CREATE\s*TABLE\s*(?<tableName>\w*)\s*(?:(?<parameters>\(.*\))|(?:AS (?<selectCopy>.*)))$/gmi;
                    let matches = createRegex.exec(query);
                    if (matches === null) {
                        return { error: "Not supported operation" };
                    }
                    matches = matches.groups;
                    let table;
                    if (tables.find(data, matches.tableName)) {
                        return { warn: "This table already exists" };
                    }
                    if (matches.parameters) {
                        let parameters = getParameters(matches.parameters);
                        if (parameters.error) {
                            return parameters;
                        }
                        table = new Table(parameters.parameters);
                        if (table.error) {
                            return table;
                        }
                        data[matches.tableName + ";" + parameters.keys.primary + ";" + parameters.keys.foreign.join(",")] = table;
                    } else {}
                    if (!DBUtils.transaction) {
                        DBUtils.save();
                    }
                    return { message: "Table created" };
                },
                drop: function(query) {
                    let dropRegex = /^DROP\s*TABLE\s*(?<tableName>\w*)\s*$/gmi;
                    let matches = dropRegex.exec(query);
                    if (matches === null) {
                        return { error: "Not supported operation" };
                    }
                    matches = matches.groups;
                    if (!tables.find(data, matches.tableName)) {
                        return { warn: "This table doesn't exists" };
                    }
                    delete data[tables.finder(data, matches.tableName)];
                    if (!DBUtils.transaction) {
                        DBUtils.save();
                    }
                    return { message: "Table dropped" };
                },
                trucate: function(query) {
                    let truncateRegex = /^TRUNCATE\s*TABLE\s*(?<tableName>\w*)\s*$/gmi;
                    let matches = truncateRegex.exec(query);
                    if (matches === null) {
                        return { error: "Not supported operation" };
                    }
                    matches = matches.groups;
                    if (!tables.find(data, matches.tableName)) {
                        return { warn: "This table doesn't exists" };
                    }
                    let table = tables.find(data, matches.tableName);
                    for (let index = 0; index < table.length; index++) {
                        const element = table[index];
                        element = [];
                    }
                    if (!DBUtils.transaction) {
                        DBUtils.save();
                    }
                    return { message: "Table truncated" };
                },
                start: function(query) {
                    let startRegex = /^START\s*TRANSACTION\s*$/gmi;
                    let matches = startRegex.compile(query);
                    if (matches) {
                        DBUtils.transaction = true;
                        return { message: "Transaction starts" };
                    } else {
                        return { error: "Not supported operation" };
                    }
                },
                end: function(query) {
                    let endRegex = /^END\s*TRANSACTION\s*$/gmi;
                    let matches = endRegex.compile(query);
                    if (matches) {
                        DBUtils.transaction = false;
                        DBUtils.save();
                        return { message: "Transaction ends" };
                    } else {
                        return { error: "Not supported operation" };
                    }
                },
                tables: function(query) {
                    let tablesRegex = /^TABLES\s*$/gmi;
                    let matches = tablesRegex.compile(query);
                    if (matches) {
                        let tables = [];
                        for (const key in data) {
                            if (data.hasOwnProperty(key)) {
                                tables.push(key.split(";")[0]);
                            }
                        }
                        return { result: { "tables;0;": tables } };
                    } else {
                        return { error: "Not supported operation" };
                    }
                },
                getValues: function (values) {
                    const strAll = values.match(/['|"][^'"]*['|"]/ig);
                    const splitAll = values.split(/['|"][^'"]*['|"]/i);
                    let data = [];
                    let i = 0;
                    for (; i < splitAll.length; i++) {
                        let val = splitAll[i];
                        if (val.charAt(0) === ',') {
                            val = val.substring(1);
                        }
                        if (val.charAt(val.length - 1) === ',') {
                            val = val.substring(0, val.length - 1);
                        }
                        if (val !== '') {
                            const values = val.split(',');
                            data = data.concat(values);
                        }
                        if (strAll && strAll[i]) {
                            data.push(strAll[i]);
                        }
                    }
                    if(strAll){
                        for (; i < strAll.length; i++) {
                            data.push(strAll[i]);
                        }
                    }
                    return data;
                },
            };

            function Table(variables) {
                let table = {};
                for (let index = 0; index < variables.length; index++) {
                    const element = variables[index];
                    if (!tables.find(table, element.name)) {
                        if (element.constraints) {
                            table[element.name + ";" + index + ";" + element.datatype + ";" + element.constraints] = {};
                        } else {
                            table[element.name + ";" + index + ";" + element.datatype] = {};
                        }
                    } else {
                        return { error: "Variable already exists" };
                    }
                }
                return table;
            }
            var tables = {
                find: function(container, search) {
                    for (const key in container) {
                        if (container.hasOwnProperty(key)) {
                            const element = container[key];
                            if (key.split(";")[0] === search) {
                                return element;
                            }
                        }
                    }
                    return undefined;
                },
                finder: function(container, search) {
                    for (const key in container) {
                        if (container.hasOwnProperty(key)) {
                            const element = container[key];
                            if (key.split(";")[0] === search) {
                                return key;
                            }
                        }
                    }
                    return undefined;
                },
                findColumn: function(table, column) {
                    for (const key in table) {
                        if (table.hasOwnProperty(key)) {
                            const element = table[key];
                            if (key.split(";")[0] === column) {
                                return element;
                            }
                        }
                    }
                    return undefined;
                },
                insert: function(tableName, table, values, order, key) {
                    let tableData = tables.finder(data, tableName);
                    let insertData = {};
                    // This generates the data to insert and applies the constraits
                    for (const key in table) {
                        if (table.hasOwnProperty(key)) {
                            const column = table[key];
                            let columnName = key.split(";")[0];
                            let index = order.indexOf(columnName);
                            let datatype = key.split(";")[2];
                            let constraints = key.split(";")[3] ? key.split(";")[3] : "";
                            let value = null;
                            if (index !== -1) {
                                //the insert contains the column
                                value = this.checkDatatype(datatype, values[index]);
                            } else {
                                //the insert doesn't contain the column
                                if (constraints.includes("DEFAULT")) {
                                    let defaultRegex = /DEFAULT\s*(?<defaultValue>.*),/gmi;
                                    vaule = this.checkDatatype(datatype, defaultRegex.exec(constraints).groups.defaultValue);
                                }
                                if (constraints.includes("AUTO_INCREMENT")) {
                                    value = Object.keys(column).length;
                                }
                            }
                            if (value) {
                                if (value !== null) {
                                    if (value.error) {
                                        return value;
                                    }
                                }
                            }
                            if (constraints.includes("NOT_NULL")) {
                                if (value === null) {
                                    return { error: "Value of column " + columnName + " cannot be null" };
                                }
                            }
                            if (constraints.includes("UNIQUE")) {
                                for (const key in column) {
                                    if (column.hasOwnProperty(key)) {
                                        const element = object[key];
                                        if (value === element) {
                                            return { error: "Value of column " + columnName + " has to be unique" };
                                        }
                                    }
                                }
                            }
                            if (constraints.includes("CHECK")) {}
                            insertData[key] = value;
                        }
                    }
                    // checks if the foreing key exists
                    if (tableData.split(";")[2]) {
                        let foreignKeys = tableData.split(";")[2].split(",");
                        for (let index = 0; index < foreignKeys.length; index++) {
                            const foreignKey = foreignKeys[index];
                            let value = insertData[tables.finder(table, foreignKey.split(":")[0])];
                            let foreingTable = tables.find(data, foreignKey.split(":")[1].split("(")[0]);
                            let foreignValues = tables.find(foreingTable, foreignKey.split(":")[1].split("(")[1].slice(0, -1));
                            let found = false;
                            for (const key in foreignValues) {
                                if (foreignValues.hasOwnProperty(key)) {
                                    if (value === foreignValues[key]) {
                                        found = true;
                                        break;
                                    }
                                }
                            }
                            if (!found) {
                                return { error: "The foreign key " + foreignKey.split(":")[0] + " is not present in the foreign table" };
                            }
                        }
                    }
                    let primaryKey;
                    if (tableData.split(";")[1]) {
                        primaryKey = insertData[tables.finder(table, tableData.split(";")[1])];
                        if (primaryKey === null) {
                            return { error: "The primary key cannot be null" };
                        }
                    } else {
                        if (key) {
                            primaryKey = key;
                        } else {
                            primaryKey = Object.keys(table[Object.keys(table)[0]]).length;
                        }
                    }
                    for (const key in table) {
                        if (table.hasOwnProperty(key)) {
                            const element = table[key];
                            element[primaryKey] = insertData[key];
                        }
                    }
                    return { message: "Values inserted succesfully" };
                },
                checkDatatype: function(datatype, value) {
                    if (value.toUpperCase().includes("NULL")) {
                        return null;
                    }
                    switch (datatype) {
                        case "STRING":
                            let regexString = /^(?:"(?<string1>.*)"|'(?<string2>.*)')$/gmi;
                            let match = regexString.exec(value);
                            if (!match) {
                                return { error: "Value " + value + " is supposed to be a string" };
                            }
                            match = match.groups;
                            if (match.string1 || match.string1 === "") {
                                if (match.string1 === "") {
                                    return "";
                                }
                                return match.string1;
                            } else {
                                if (match.string2 || match.string2 === "") {
                                    if (match.string2 === "") {
                                        return "";
                                    }
                                    return match.string2;
                                } else {
                                    return { error: "Value " + value + " is supposed to be a string" };
                                }
                            }
                        case "NUMBER":
                            let number = Number(value);
                            if (isNaN(number)) {
                                return { error: "Value " + value + " is supposed to be a number" };
                            } else {
                                return number;
                            }
                        case "BOOLEAN":
                            if (value.toUpperCase().includes("TRUE")) {
                                return true;
                            }
                            if (value.toUpperCase().includes("FALSE")) {
                                return false;
                            }
                            return { error: "Value " + value + " is supposed to be a boolean" };
                        default:
                            return { error: "Not supported datatype" };
                    }
                },
                transform: function(table, distinct, order) {
                    let result = { header: [], values: [] };
                    let keys = Object.keys(table);
                    for (const key in table) {
                        if (table.hasOwnProperty(key)) {
                            result.header.push({ name: key.split(";")[0], datatype: key.split(";")[2], constraints: key.split(";")[3] });
                        }
                    }
                    for (const key in table[keys[0]]) {
                        if (table[keys[0]].hasOwnProperty(key)) {
                            let values = [];
                            for (let index = 0; index < keys.length; index++) {
                                const column = keys[index];
                                values.push(table[column][key]);
                            }
                            if (distinct) {
                                let exist = result.values.find(function(element) {
                                    return JSON.stringify(element) === JSON.stringify(values);
                                })
                                if (exist) {
                                    continue;
                                }
                            }
                            result.values.push(values);
                        }
                    }
                    if (order) {
                        result.values.sort(function(a, b) {
                            for (let index = 0; index < order.length; index++) {
                                const orderElement = order[index];
                                let orderColumn;
                                let orderIndex;
                                for (let index = 0; index < result.header.length; index++) {
                                    const element = result.header[index];
                                    if (element.name === orderElement.name) {
                                        orderColumn = element;
                                        orderIndex = index;
                                        break;
                                    }
                                }
                                let orderResult;
                                switch (orderColumn.datatype) {
                                    case "NUMBER":
                                        if (a[orderIndex] === b[orderIndex]) {
                                            orderResult = 0;
                                            break;
                                        }
                                        if (a[orderIndex] > b[orderIndex]) {
                                            orderResult = 1;
                                        } else {
                                            orderResult = -1;
                                        }
                                        break;
                                    case "STRING":
                                        orderResult = a[orderIndex].localeCompare(b[orderIndex]);
                                        break;
                                    case "BOOLEAN":
                                        orderResult;
                                        if (a[orderIndex] === b[orderIndex]) {
                                            orderResult = 0;
                                            break;
                                        }
                                        if (a[orderIndex]) {
                                            orderResult = 1;
                                        } else {
                                            orderResult = -1;
                                        }
                                        break;
                                }
                                if (orderResult === 0) {
                                    continue;
                                }
                                if (orderElement.desc) {
                                    orderResult = -orderResult;
                                }
                                return orderResult;
                            }
                            return 1;
                        });
                    }
                    return result;
                },
                where: function(where, table) {
                    function checkWord(word, columnList) {
                        if (word === "") {
                            return "";
                        }
                        if (word.toUpperCase() === "AND") {
                            return "&&";
                        }
                        if (word.toUpperCase() === "OR") {
                            return "||";
                        }
                        if (word.toUpperCase() === "NOT") {
                            return "!";
                        }
                        if (word.toUpperCase() === "IS") {
                            return "==";
                        }
                        if (word.toUpperCase() === "NULL") {
                            return null;
                        }
                        if (word.toUpperCase() === "TRUE") {
                            return "true";
                        }
                        if (word.toUpperCase() === "FALSE") {
                            return "false";
                        }
                        if (columnList.includes(word)) {
                            return "myTable[tables.finder(myTable,'" + word + "')][key]";
                        }
                        if (!isNaN(Number(word))) {
                            return Number(word);
                        }
                        return "";
                    }
                    let columnList = Object.keys(table);
                    for (let index = 0; index < columnList.length; index++) {
                        columnList[index] = columnList[index].split(";")[0];
                    }
                    let result = "";
                    let dividedWhere = where.split("");
                    let currentWord = "";
                    let currentOperation;
                    let onString;
                    for (let index = 0; index < dividedWhere.length; index++) {
                        const character = dividedWhere[index];
                        if (!onString) {
                            if (character === "(" || character === ")") {
                                result = result + checkWord(currentWord, columnList);
                                currentWord = "";
                                result = result + character;
                                continue;
                            }
                            //Controls multiple character operations
                            if (currentOperation) {
                                if (character === "=") {
                                    result = result + currentOperation + character;
                                    currentOperation = undefined;
                                    continue;
                                }
                                if (character === ">" && currentOperation === "<") {
                                    result = result + "!=";
                                    currentOperation = undefined;
                                    continue;
                                }
                                result = result + currentOperation;
                                currentOperation = undefined;
                            }
                            if (character === "<" || character === ">") {
                                result = result + checkWord(currentWord, columnList);
                                currentWord = "";
                                currentOperation = character;
                                continue;
                            }
                            if (character === "=") {
                                result = result + checkWord(currentWord, columnList);
                                currentWord = "";
                                result = result + "===";
                                continue;
                            }
                            if (character === '"' || character === "'") {
                                result = result + checkWord(currentWord, columnList);
                                currentWord = "";
                                onString = { separator: character, word: "" };
                                continue;
                            }
                            if (character === " ") {
                                result = result + checkWord(currentWord, columnList);
                                currentWord = "";
                                continue;
                            }
                            currentWord = currentWord + character;
                        } else {
                            if (onString.separator === character) {
                                result = result + onString.separator + onString.word + onString.separator;
                                onString = undefined;
                            } else {
                                onString.word = onString.word + character;
                            }
                        }
                    }
                    result = result + checkWord(currentWord, columnList);
                    currentWord = "";
                    return result;
                }
            };

            function createDB(name) {
                DBUtils.name = name;
                DBUtils.load();
            }

            function messageHandler(e) {
                if (e.data.drop) {
                    DBUtils.drop();
                    return;
                }
                if (e.data.backup) {
                    postMessage({ backup: JSON.stringify(data) });
                    return;
                }
                if (e.data.restore) {
                    data = JSON.parse(e.data.restore);
                    DBUtils.save();
                    return;
                }
                SQLParser.parse(e.data.querys, e.data.id);
            }
            onmessage = messageHandler;
        };
        db.id = 0;
        db.callbacks = [];
        if (window.indexedDB) {
            if (typeof(Worker) !== "undefined") {
                db.worker = new Worker(URL.createObjectURL(new Blob(["(" + db.server.toString().slice(0, -1) +
                    "createDB('" + dbName + "');})()"
                ], { type: 'text/javascript' })));
                db.worker.onmessage = function(e) {
                    if (e.data.end) {
                        db.worker.terminate();
                        db.end = true;
                        return;
                    }
                    if (e.data.backup) {
                        db.backupCallback(JSON.parse(e.data.backup));
                        return;
                    }
                    if (typeof db.callbacks == 'undefined') {
                        db.callbacks = [];
                    }
                    if (db.callbacks[e.data.id]) {
                        db.callbacks[e.data.id](e.data.response);
                    }
                    db.callbacks[e.data.id] = undefined;
                };
                db.query = function(query, callback) {
                    if (db.end) {
                        console.warn("This database has been dropped already");
                        return;
                    }
                    db.worker.postMessage({ querys: query, id: db.id });
                    db.callbacks[db.id] = callback;
                    db.id++;
                };
                db.drop = function() {
                    if (db.end) {
                        console.warn("This database has been dropped already");
                        return;
                    }
                    db.worker.postMessage({ drop: true });
                };
                db.backup = function(callback) {
                    if (db.end) {
                        console.warn("This database has been dropped already");
                        return;
                    }
                    db.backupCallback = callback;
                    db.worker.postMessage({ backup: true });
                };
                db.restore = function(backup) {
                    if (db.end) {
                        console.warn("This database has been dropped already");
                        return;
                    }
                    db.worker.postMessage({ restore: JSON.stringify(backup) });
                };
            } else {
                console.warn("Browser does not support Web Workers");
                return this;
            }
        } else {
            console.warn("Browser does not support indexDB");
            return this;
        }
        /**
         * The headers of a result table
         * @typedef {Object} tableResultHeader
         * @property {String} name - Name of the header.
         * @property {String} datatype - The datatype of the header.
         * @property {string} constraints - The constraints of the header, separed by commas ",".
         */
        /**
         * The result table of a query.
         * @typedef {Object} tableResult
         * @property {tableResultHeader[]} header - It is a list of the headers of this table and it's properties.
         * @property {Array[]} values - It is a list of the rows returned by the query, it consists of a list of the values with the same order as the header.
         */
        /**
         * The result of a IndexSQL query. It will contain at least one of these properties.
         * @typedef {Object} queryResult
         * @property {String} [message] - A message, it usually means that the query has been executed sucessfully.
         * @property {String} [warn] - A warn, it means an error was detected, but it won't stop a transaction. Example: Dropping a table that does not exist.
         * @property {String} [error] - An error, it means that the query was erroneus, it will stop a transaction.
         * @property {tableResult} [result] - It represents a table generated as a result of a query.
         */
        /**
         * Callback for queries execution.
         *
         * @callback dbQueryCallback
         * @param {queryResult[]} results - An array with the results of the queries.
         */
        /**
         * It executes several IndexSQL queries.
         *
         * @param {String} query - A string containing the queries you want to execute, every query has to finish with a semicolon ";".
         * For additional information about the use of queries visit https://dandimrod.github.io/IndexSQL/docs/#SQL-syntax
         * @param {dbQueryCallback} callback - Callback with the response after the queries are executed.
         */
        this.execute = db.query;
        /**
         * It drops the IndexSQL database.
         * Afterwards the object is unusable and a new IndexSQL object has to be created.
         */
        this.drop = db.drop;
        /**
         * Callback for backup execution.
         *
         * @callback dbBackupCallback
         * @param {Object} backup - The backup of the whole database.
         */
        /**
         * It backs up the database by returning the whole Javascript object that contanins the database.
         *
         * @param {dbBackupCallback} callback - Callback with the backup.
         */
        this.backup = db.backup;
        /**
         * It restores an old backup of the database.
         * Warning! The system wont perform any checks on this backup. An incorrect restore will make the library fail.
         *
         * @param {Object} backup - The backup of the whole database.
         */
        this.restore = db.restore;
        return this;
    }
}
