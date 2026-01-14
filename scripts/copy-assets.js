import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()

const copyJobs = [
  {
    from: path.join(rootDir, 'src', 'templates'),
    to: path.join(rootDir, 'dist', 'templates')
  }
]

async function main() {
  for (const job of copyJobs) {
    if (!existsSync(job.from)) {
      throw new Error(`Asset source missing: ${job.from}`)
    }

    await mkdir(path.dirname(job.to), { recursive: true })

    // Clean target to avoid stale assets
    if (existsSync(job.to)) {
      await rm(job.to, { recursive: true, force: true })
    }

    await cp(job.from, job.to, { recursive: true })
    console.log(`✅ Copied assets: ${path.relative(rootDir, job.from)} -> ${path.relative(rootDir, job.to)}`)
  }
}

main().catch(err => {
  console.error('❌ Asset copy failed:', err)
  process.exit(1)
})
