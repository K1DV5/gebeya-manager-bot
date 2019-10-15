const Jimp = require('jimp')
const https = require('https')
const fs = require('fs')
const path = require('path')

function makeKeyboardTiles(buttons) {
    let keyboardRows = []
    let keyboardTiles = []
    for (let button of buttons) {
        if (keyboardTiles.length === 3) {
            keyboardRows.push(keyboardTiles)
            keyboardTiles = [button]
        } else {
            keyboardTiles.push(button)
        }
    }
    if (keyboardTiles.length) {
        keyboardRows.push(keyboardTiles)
    }
    return keyboardRows
}

function argparse(from) {
    // find values of parameters written like cli args: /command -p param /// but spaces are allowed.
    let paramsSection = from[0] === '/'? from.split(' ').slice(1) : from.trim()
    let params = {positional: []}
    let currentKey = null
    for (let part of paramsSection) {
        part = part.trim()
        if (part) {
            if (part[0] === '-') {
                part = part.slice(1)
                if (currentKey && !params[currentKey]) {
                    params[currentKey] = true
                } else if (params[currentKey] && typeof params[currentKey] === 'string') {
                    params[currentKey] = params[currentKey].trim()
                }
                currentKey = part
                params[currentKey] = true
            } else {
                if (currentKey === null) {
                    params.positional.push(part)
                } else if (typeof params[currentKey] === 'string') {
                    params[currentKey] += ' ' + part
                } else {
                    params[currentKey] = part
                }
            }
        }
    }
    return params
}

function downloadFile(url, filePath) {
    return new Promise(async (resolve, reject) => {
        await fs.promises.mkdir(path.dirname(filePath), {recursive: true})
        let fileStream = fs.createWriteStream(filePath)
        fileStream.on('finish', () => {fileStream.close(); resolve(filePath)})
        fileStream.on('error', () => {fs.promises.unlink(filePath); reject()})

        https.get(url, response => {
            if (response.statusCode === 200) {
                response.pipe(fileStream)
            } else {
                reject(response.statusCode)
            }
        }).on('error', () => {fs.promises.unlink(filePath); reject()})
    })
}

async function downloadPhotos(destDir, files, token) {
    let downloaded = []
    if (files.constructor === Array) {
        await Promise.all(files.map(async file => {
            let filePath = path.join(destDir, path.basename(file.file_path))
            let url = `https://api.telegram.org/file/bot${token}/${file.file_path}`
            await downloadFile(url, filePath)
            downloaded.push(filePath)
        }))
    }
    return downloaded
}

function watermarkProps(width, height, proportion = 0.3) {
    let watermarkPos = 1 - proportion
    let edgeOffset = proportion/2
    return {
        x: width * watermarkPos - edgeOffset,
        y: height * watermarkPos - edgeOffset,
        w: width * proportion,
        h: height * proportion
    }
}

// width and height arrangements
function arrange(total, width) {
    let cols = Math.floor(Math.sqrt(total))
    let left = total - cols**2
    let addFullRows = Math.floor(left/cols)
    let addRowItems = left % cols
    let rows = cols + addFullRows
    let gap = 10 // gap between images

    let arrangement = []
    let singleWidth = ((width + gap) / cols) - gap
    let totalRows = rows + (addRowItems? 1:0)
    let singleHeight = (cols/totalRows) * singleWidth
    let yOffset = 0
    if (addRowItems) {
        let rowSingleWidth = ((width + gap) / addRowItems) - gap
        for (let i = 0; i < addRowItems; i++) {
            let xOffset = i * (rowSingleWidth + gap)
            arrangement.push({x: xOffset, y: yOffset, w: rowSingleWidth, h: singleHeight})
        }
        yOffset += singleHeight + gap
    }
    for (let j = 0; j < rows; j++) {
        yOffset += Math.ceil(j/(j+1))/* 0 or 1 */ * (singleHeight + gap)
        for (let i = 0; i < cols; i++) {
            let xOffset = i * (singleWidth + gap)
            arrangement.push({x: xOffset, y: yOffset, w: singleWidth, h: singleHeight})
        }
    }
    let height = yOffset + singleHeight
    return {width, height, arrangement, watermark: watermarkProps(width, height)}
}

async function watermark(image, dest, watermarkImg) {
    if (watermarkImg) {
        if (typeof image === 'string') {
            image = await Jimp.read(image)
        }
        watermarkImg = await Jimp.read(watermarkImg)
        let props = watermarkProps(image.bitmap.width, image.bitmap.height)
        await watermarkImg.contain(props.w, props.h, Jimp.HORIZONTAL_ALIGN_RIGHT | Jimp.VERTICAL_ALIGN_BOTTOM)
        await image.composite(watermarkImg, props.x, props.y)
        if (dest) {
            image.write(dest)
        }
    }
}

async function watermarkDir(sourceDir, destDir, watermarkImg) {
    for (let file of await fs.promises.readdir(sourceDir)) {
        watermark(path.join(sourceDir, file), path.join(destDir, file), watermarkImg)
    }
}

async function makeCollage(sources, dest, watermarkImg = undefined, width = 720) {
    if (typeof sources === 'string') {  // a username was passed, read every file in that folder
        sources = (await fs.promises.readdir(sources)).map(file => path.join(sources, file))
    }
    let collageProps = arrange(sources.length, width)
    let collage = await (new Jimp(collageProps.width, collageProps.height))
    for (let [index, file] of sources.entries()) {
        let props = collageProps.arrangement[index]
        let image = await Jimp.read(file)
        await image.cover(props.w, props.h)
        collage.composite(image, props.x, props.y)
    }
    if (watermarkImg) {
        await watermark(collage, null, watermarkImg)
    }
    collage.write(dest)
}

async function rmdirWithFiles(dir) {
    let files = await fs.promises.readdir(dir)
    await Promise.all(files.map(async file => {
        let filePath = path.join(dir, file)
        await fs.promises.unlink(filePath)
    }))
    fs.promises.rmdir(dir)
}

async function draftToPostable(username, queryFunc, type) {
    let adminData
    if (type === undefined) { // general
        let query = `SELECT p.username,
                            p.chat_id,
                            p.draft_destination AS destination,
                            p.draft_title AS title,
                            p.draft_description AS description,
                            p.draft_price as price,
                            p.draft_image_ids AS images,
                            p.preview_post_message_id as previewId,
                            p.removed_message_ids as removedIds,
                            p.conversation as stage,
                            c.caption_template AS template,
                            c.description_bullet as bullet
                     FROM people AS p
                     INNER JOIN channels AS c
                        ON c.username = p.draft_destination
                     WHERE p.username = ?`
        adminData = (await queryFunc(query, [username]))[0]
    } else if (type === 'edit') { // for the edit caption functionality
        // get the channel's caption template
        let channel = (await queryFunc('SELECT draft_destination FROM people WHERE username = ?', [username]))[0].draft_destination.split('/')[0]
        let channelData = (await queryFunc('SELECT caption_template, description_bullet FROM channels WHERE username = ?', [channel]))[0]
        let query = `SELECT draft_destination as destination,
                            draft_title AS title,
                            draft_description AS description,
                            draft_price AS price,
                            draft_image_ids AS images,
                            removed_message_ids as removedIds,
                            conversation AS stage
                     FROM people WHERE username = ?`
        adminData = (await queryFunc(query, [username]))[0]
        adminData.template = channelData.caption_template
        adminData.bullet = channelData.description_bullet
    }
    if (adminData) {
        adminData.caption = adminData.template
            .replace(/:title\b/, adminData.title)
            .replace(/:description\b/, adminData.description.replace(/^\./gm, adminData.bullet))
            .replace(/:price\b/, adminData.price)
        adminData.images = adminData.images ? JSON.parse(adminData.images) : null
        adminData.removedIds = adminData.removedIds ? JSON.parse(adminData.removedIds) : null
        return adminData
    }
    console.log('Not found')
}

module.exports = {
    argparse,
    draftToPostable,
    makeCollage,
    watermarkDir,
    downloadFile,
    downloadPhotos,
    rmdirWithFiles,
    makeKeyboardTiles
}
