const https = require('https')
const fs = require('fs')

const BASE_URL = 'https://raw.githubusercontent.com/bluestacks-em/em/refs/heads/main'

startDownload()

async function startDownload() {
    await fileDownload('Emulator.exe', 'emulator', 2)
    await fileDownload('Nougat32_5.22.166.1003.exe', 'device', 6)
}

async function downloadPart(part, fileN, writeStream) {
    return new Promise((resolve, reject) => {
        let fileName = `${fileN}${String(part).padStart(2, "0")}.bin`
        let url = `${BASE_URL}/${fileName}`;

        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`${fileName} download failed: HTTP ${res.statusCode}`))
                return
            }

            res.pipe(writeStream, { end: false })

            res.on("end", () => {
                resolve()
            })

            res.on("error", reject)
        }).on("error", reject)
    })
}

async function fileDownload(name, fileName, size) {
    if (fs.existsSync(name)) {
        return
    }

    let writeStream = fs.createWriteStream(name)

    try {
        for (let i = 1; i <= size; i++) {
            await downloadPart(i, fileName, writeStream)
        }

        writeStream.end()

        writeStream.on("finish", () => {
            console.log('Download COmpleted: '+name)
        })
    } catch (err) {
        writeStream.destroy()
    }
}