const Jimp = require('jimp')
const https = require('https')
const fs = require('fs')
const path = require('path')

async function downloadPhotos(destDir, files, token) {
    try {
        await fs.promises.mkdir(destDir, {recursive: true})
    } catch(err) {
        console.log('photos.downloadPhotos/catch: ', err.message)
    }
    let downloaded = []
    await Promise.all(files.map(file => {
        return new Promise((resolve, reject) => {
            let filePath = path.join(destDir, path.basename(file.file_path))
            let fileStream = fs.createWriteStream(filePath)
            fileStream.on('finish', () => {
                downloaded.push(filePath)
                fileStream.close()
                resolve()
            })
            fileStream.on('error', (err) => {
                fs.unlink(filePath, () => reject(err))
            })

            let url = `https://api.telegram.org/file/bot${token}/${file.file_path}`
            https.get(url, response => {
                if (response.statusCode === 200) {
                    response.pipe(fileStream)
                } else {
                    console.log('Not ok, statusCode: ', response.statusCode)
                }
            }).on('error', err => {
                fs.unlink(fileStream)
                reject(err)
            })
        })
    }))
    return downloaded
}

function watermarkProps(width, height, proportion = 0.2) {
    let watermarkPos = 1 - proportion
    return {
        x: width * watermarkPos - 40,
        y: height * watermarkPos - 40,
        w: width * proportion,
        h: height * proportion
    }
}

// width and height arrangements
function arrange(total, width) {
    if (total === 1) {
        let height = width
        return {
            width,
            height,
            arrangement: [{x: 0, y: 0, w: width, h: height}],
            watermark: watermarkProps(width, height)
        }
    }
    let gap = 10 // gap between images
    if (total === 2) {
        let height = width * 5 / 4
        let singleHeight = (height - gap) / 2
        return {
            width,
            height,
            arrangement: [
                {x: 0, y: 0, w: width, h: singleHeight},
                {x: 0, y: singleHeight + gap, w: width, h: singleHeight}
            ],
            watermark: watermarkProps(width, height)
        }
    }
    let singleWidth = (width - gap) / 2
    let singleHeight = singleWidth
    let rem = total % 2
    let height = (singleHeight + gap) * (total + rem) / 2 - gap
    arrangement = []
    let currentLine = 0
    if (rem) {
        arrangement.push({x: 0, y: 0, w: width, h: singleHeight})
        currentLine += singleHeight + gap
        total--
    }
    for (let i = 0; i < total / 2; i++) {
        arrangement.push({x: 0, y: currentLine, w: singleWidth, h: singleHeight})
        arrangement.push({x: singleWidth + gap, y: currentLine, w: singleWidth, h: singleHeight})
        currentLine += singleHeight + gap
    }
    return {width, height, arrangement, watermark: watermarkProps(width, height)}
}

async function watermark(image, dest, watermarkImg) {
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

async function watermarkDir(sourceDir, destDir, watermarkImg) {
    for (let file of await fs.promises.readdir(sourceDir)) {
        watermark(path.join(sourceDir, file), path.join(destDir, file), watermarkImg)
    }
}

async function makeCollage(sources, dest, watermarkImg = undefined, width = 1024) {
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
        try {
            await watermark(collage, null, watermarkImg)
        } catch {
            console.log('Error on watermark image')
        }
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

module.exports = {
    makeCollage,
    watermarkDir,
    downloadPhotos,
    rmdirWithFiles
}
