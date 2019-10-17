
class BaseModel {
    constructor(dbConn, table, cols) {
        this.cols = cols
        this.table = table
        this.dbConn = dbConn
    }

    sql(sql, args) {
        // process sql query and return the result
        return new Promise((resolve) => {
            this.dbConn.query(sql, args, (error, results) => {
                if (error) {
                    console.log(error.message)
                } else if (results) {
                    resolve(results)
                }
            })
        })
    }

    prepareWhere(index) {
        // index: string, object
        let values
        let where = ' WHERE '
        if (typeof index === 'string') {
            values = [index]
            where += this.cols[0] + '=?'
        } else { // an object passed
            values = []
            for (let [key, val] of Object.entries(index).filter(pair => this.cols.includes(pair[0]))) {
                where += key + '=?,'
                values.push(val)
            }
            where = where.slice(0, where.length-1) // remove last comma
        }
        return {where, values}
    }

    async exists(index) {
        let {where, values} = this.prepareWhere(index)
        if ((await this.sql('SELECT 1 FROM ' + this.table + where, values))[0]) {
            return true
        }
        return false
    }

    insert(props, onlyOnDuplicate={}) {
        let pairs = Object.entries(props).filter(p => this.cols.includes(p[0]))
        let optPairs = Object.entries(onlyOnDuplicate).filter(p => this.cols.includes(p[0]))
        let query
        let values
        if (pairs.length === 1 && !optPairs.length) {
            let pair = pairs[0]
            query = 'INSERT IGNORE INTO ' + this.table + ' (' + pair[0] + ') VALUES (?)'
            values = [pair[1]]
        } else {
            query = 'INSERT INTO ' + this.table + '('
            let postQuery = ' ON DUPLICATE KEY UPDATE '
            values = []
            for (let pair of pairs) {
                query += pair[0] + ','
                postQuery += pair[0] + '=' + 'VALUES(' + pair[0] + '),'
                values.push(pair[1])
            }
            query = query.slice(0, query.length-1)
                    + ') VALUES ('
                    + '?,'.repeat(values.length).slice(0, values.length*2-1)
            for (let pair of optPairs) {
                postQuery += pair[0] + '=' + '?,'
                values.push(pair[1])
            }
            query += ')' + postQuery.slice(0, postQuery.length-1)
        }
        // console.log(query, values)
        this.sql(query, values)
    }

    async get(index, cols) {
        // index: string, object
        // cols: string, array, undefined
        let {where, values} = this.prepareWhere(index)
        if (typeof cols === 'string') {
            if (this.cols.includes(cols)) {
                let query = 'SELECT ' + cols + ' FROM ' + this.table + where
                return (await this.sql(query, values))[0][cols]
            }
        }
        let available = cols.filter(col => this.cols.includes(col))
        let query = 'SELECT ' + available.join(',') + ' FROM ' + this.table + where
        let result = await this.sql(query, values)
        if (result.length === 1) {
            return result[0]
        }
        return result
    }

    set(index, params) {
        let query = 'UPDATE ' + this.table + ' SET '
        let values = []
        for (let [key, val] of Object.entries(params).filter(p => this.cols.includes(p[0]))) {
            query += key + '=?,'
            values.push(val)
        }
        let {where, values: whereValues} = this.prepareWhere(index)
        query = query.slice(0, query.length-1) + where
        this.sql(query, [...values, ...whereValues])
    }

}
// let b = new BaseModel('people', ['username', 'chat_id', 'conversation'])
// b.exists('K1DV5').then(console.log)
// b.insert({username: 'K1DV5'})
// b.get('K1DV5', ['chat_id']).then(console.log)

module.exports = BaseModel
