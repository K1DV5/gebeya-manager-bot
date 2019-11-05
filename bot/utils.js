const Jimp = require('jimp')
const https = require('https')
const fs = require('fs')
const path = require('path')

function makeKeyboardTiles(buttons, cols=2) {
    let keyboardRows = []
    let keyboardTiles = []
    for (let button of buttons) {
        if (keyboardTiles.length === cols) {
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
        fileStream.on('error', (err) => {fs.promises.unlink(filePath).then(() => reject(err))})

        https.get(url, response => {
            if (response.statusCode === 200) {
                response.pipe(fileStream)
            } else {
                reject(response.statusCode)
            }
        }).on('error', (err) => {fs.promises.unlink(filePath).then(() => reject(err))})
    })
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
    let singleHeight = (cols/totalRows) * singleWidth * 1.2
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
    let filePaths = []
    for (let file of await fs.promises.readdir(sourceDir)) {
        let filePath = path.join(sourceDir, file)
        watermark(filePath, path.join(destDir, file), watermarkImg)
        filePaths.push(filePath)
    }
    return filePaths
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
    try {
        let files = await fs.promises.readdir(dir)
        await Promise.all(files.map(async file => {
            let filePath = path.join(dir, file)
            await fs.promises.unlink(filePath)
        }))
        fs.promises.rmdir(dir)
    } catch(err) {
        if (err.code !== 'ENOENT') {
            throw err
        }
    }
}

module.exports = {
    argparse,
    makeCollage,
    watermarkDir,
    downloadFile,
    rmdirWithFiles,
    makeKeyboardTiles
}
