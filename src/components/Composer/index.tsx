import { useEffect, useRef, useState } from 'react'
import { Button, Input, Tag, Tooltip, Upload, message as antdMessage } from 'antd'
import {
  ArrowUpOutlined,
  AudioOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PictureOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useChatContext } from '../../context/ChatContext'
import { useSpeech } from '../../hooks/useSpeech'
import { createThumbnail } from '../../utils/image'
import { MAX_FILE_SIZE, MAX_FILES, formatSize, isImageFile } from '../../utils/file'
import styles from './index.module.less'

const ACCEPT =
  '.txt,.md,.markdown,.json,.jsonl,.csv,.tsv,.log,.xml,.yml,.yaml,.js,.jsx,.ts,.tsx,.css,.less,.scss,.html,.htm,.vue,.py,.java,.kt,.c,.h,.cpp,.hpp,.cs,.go,.rs,.rb,.php,.swift,.dart,.sql,.sh,.bash,.zsh,.env,.ini,.toml,.conf,.pdf,.docx,.jpg,.jpeg,.png,.gif,.webp,.bmp'

const Composer = () => {
  const { sendMessage, stop, loading, pendingCount, currentId, getDraft, setDraft, clearDraft } =
    useChatContext()
  const draftKey = currentId || 'new'
  const initialDraft = getDraft(draftKey)

  const [input, setInput] = useState(initialDraft.text)
  const [files, setFiles] = useState(initialDraft.files)
  const [dragging, setDragging] = useState(false)
  const composingRef = useRef(false)
  const dragDepthRef = useRef(0)

  const speech = useSpeech((text) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text))
  })

  useEffect(() => {
    setDraft(draftKey, { text: input, files })
  }, [draftKey, input, files, setDraft])

  const addFile = (file) => {
    if (file.size > MAX_FILE_SIZE) {
      antdMessage.error(`${file.name} 超过 8MB，无法上传`)
      return
    }

    const uid = file.uid || `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 6)}`

    setFiles((prev) => {
      if (prev.length >= MAX_FILES) {
        antdMessage.warning(`最多上传 ${MAX_FILES} 个附件`)
        return prev
      }
      if (prev.some((item) => item.name === file.name && item.size === file.size)) {
        return prev
      }
      return [
        ...prev,
        { uid, name: file.name, size: file.size, type: file.type || '', file, preview: '' },
      ]
    })

    if (isImageFile(file)) {
      createThumbnail(file)
        .then((preview) => {
          if (!preview) return
          setFiles((prev) => prev.map((item) => (item.uid === uid ? { ...item, preview } : item)))
        })
        .catch(() => {})
    }
  }

  const addFiles = (list) => {
    Array.from(list || []).forEach(addFile)
  }

  const removeFile = (uid) => {
    setFiles((prev) => prev.filter((item) => item.uid !== uid))
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text && files.length === 0) return
    const sentFiles = files
    clearDraft(draftKey)
    setInput('')
    setFiles([])
    await sendMessage({ text, files: sentFiles })
    if (loading) antdMessage.success('已加入队列，回答完成后自动发送')
  }

  const handlePressEnter = (e) => {
    if (composingRef.current || e.nativeEvent?.isComposing) return
    if (e.shiftKey) return
    e.preventDefault()
    handleSend()
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const pasted = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) pasted.push(file)
      }
    }
    if (pasted.length) {
      e.preventDefault()
      addFiles(pasted)
    }
  }

  const handleDragEnter = (e) => {
    e.preventDefault()
    dragDepthRef.current += 1
    setDragging(true)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    dragDepthRef.current -= 1
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0
      setDragging(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setDragging(false)
    addFiles(e.dataTransfer?.files)
  }

  return (
    <div
      className={`${styles.composerSection} ${dragging ? styles.dragging : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && <div className={styles.dropHint}>松开以上传文件</div>}

      {files.length > 0 && (
        <div className={styles.pendingFiles}>
          {files.map((item) => (
            <Tag
              key={item.uid}
              className={styles.fileTag}
              closable
              onClose={() => removeFile(item.uid)}
            >
              {item.preview ? (
                <img className={styles.thumb} src={item.preview} alt={item.name} />
              ) : item.type?.startsWith('image/') ? (
                <PictureOutlined className={styles.fileIcon} />
              ) : (
                <FileTextOutlined className={styles.fileIcon} />
              )}
              <span className={styles.fileName} title={item.name}>
                {item.name}
              </span>
              <span className={styles.fileSize}>{formatSize(item.size)}</span>
            </Tag>
          ))}
        </div>
      )}

      <div className={styles.composer}>
        <Upload
          multiple
          showUploadList={false}
          accept={ACCEPT}
          beforeUpload={(file) => {
            addFile(file)
            return false
          }}
        >
          <Tooltip title="上传附件，也支持拖拽或粘贴">
            <Button
              type="text"
              className={styles.iconBtn}
              icon={<PaperClipOutlined />}
              aria-label="上传附件"
            />
          </Tooltip>
        </Upload>

        <Input.TextArea
          className={styles.input}
          value={input}
          autoSize={{ minRows: 1, maxRows: 6 }}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={handlePressEnter}
          onPaste={handlePaste}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            setTimeout(() => {
              composingRef.current = false
            }, 0)
          }}
          placeholder="给白马AI发送消息，Enter 发送，Shift+Enter 换行"
          bordered={false}
        />

        {speech.supported && (
          <Tooltip title={speech.listening ? '停止录音' : '语音输入'}>
            <Button
              type="text"
              className={`${styles.iconBtn} ${speech.listening ? styles.listening : ''}`}
              icon={<AudioOutlined />}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-label="语音输入"
            />
          </Tooltip>
        )}

        {loading && (
          <Tooltip title="停止生成，同时清空排队消息">
            <Button
              type="text"
              shape="circle"
              danger
              className={styles.iconBtn}
              icon={<StopOutlined />}
              onClick={stop}
              aria-label="停止生成"
            />
          </Tooltip>
        )}

        <Button
          type="primary"
          shape="circle"
          icon={<ArrowUpOutlined />}
          disabled={!input.trim() && files.length === 0}
          onClick={handleSend}
          aria-label={loading ? '加入队列' : '发送'}
        />
      </div>

      {pendingCount > 0 && (
        <div className={styles.pendingQueue}>
          <ClockCircleOutlined />
          {pendingCount} 条消息排队中，回答完成后自动发送
        </div>
      )}
    </div>
  )
}

export default Composer
