import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './index.module.less'

const QuestionNav = ({ questions = [], containerRef }) => {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState('')
  const listRef = useRef(null)
  const activeRef = useRef(null)
  const frameRef = useRef(0)
  const jumpingRef = useRef('')

  const updateActive = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      const container: HTMLDivElement | null = containerRef?.current
      if (!container) return
      const nodes = container.querySelectorAll('[data-question-id]')
      if (!nodes.length) {
        setActiveId('')
        return
      }

      const containerTop = container.getBoundingClientRect().top
      const target = jumpingRef.current
      if (target) {
        const targetNode = Array.from(nodes).find(
          (node) => node.getAttribute('data-question-id') === target,
        )
        const reached =
          targetNode && Math.abs(targetNode.getBoundingClientRect().top - containerTop - 12) < 40
        if (!reached) {
          setActiveId(target)
          return
        }
        jumpingRef.current = ''
      }

      let currentId = ''
      nodes.forEach((node) => {
        if (node.getBoundingClientRect().top - containerTop <= 120) {
          currentId = node.getAttribute('data-question-id') || currentId
        }
      })
      setActiveId(currentId || nodes[0].getAttribute('data-question-id') || '')
    })
  }, [containerRef])

  useEffect(() => {
    const container: HTMLDivElement | null = containerRef?.current
    if (!container) return
    const cancelJump = () => {
      jumpingRef.current = ''
    }
    updateActive()
    container.addEventListener('scroll', updateActive, { passive: true })
    container.addEventListener('wheel', cancelJump, { passive: true })
    container.addEventListener('touchstart', cancelJump, { passive: true })
    return () => {
      container.removeEventListener('scroll', updateActive)
      container.removeEventListener('wheel', cancelJump)
      container.removeEventListener('touchstart', cancelJump)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [containerRef, updateActive, questions])

  useEffect(() => {
    if (!open) return
    const list = listRef.current
    const item = activeRef.current
    if (!list || !item) return
    const top = item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2
    list.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
  }, [open, activeId])

  if (!questions.length) return null

  const railCount = Math.min(questions.length, 10)
  const activeIndex = questions.findIndex((question) => question.id === activeId)
  const railActiveIndex =
    activeIndex < 0 ? -1 : Math.min(Math.floor((activeIndex / questions.length) * railCount), railCount - 1)

  const jumpTo = (id) => {
    const container: HTMLDivElement | null = containerRef?.current
    if (!container) return
    const node = Array.from(container.querySelectorAll('[data-question-id]')).find(
      (item) => item.getAttribute('data-question-id') === id,
    )
    if (!node) return
    jumpingRef.current = id
    setActiveId(id)
    const top =
      container.scrollTop + node.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
    container.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
  }

  return (
    <div
      className={`${styles.nav} ${open ? styles.open : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className={styles.rail} aria-hidden="true">
        {Array.from({ length: railCount }, (_, index) => (
          <span
            key={index}
            className={`${styles.tick} ${index === railActiveIndex ? styles.tickActive : ''}`}
          />
        ))}
      </div>

      <div className={styles.panel} role="navigation" aria-label="提问记录">
        <div className={styles.panelHead}>
          <span>提问记录</span>
          <span className={styles.count}>{questions.length}</span>
        </div>
        <div className={styles.list} ref={listRef}>
          {questions.map((question, index) => {
            const active = question.id === activeId
            return (
              <button
                key={question.id}
                type="button"
                ref={active ? activeRef : null}
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                title={question.content}
                onClick={() => {
                  setOpen(false)
                  jumpTo(question.id)
                }}
              >
                <span className={styles.index}>{index + 1}</span>
                <span className={styles.text}>{question.content}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default QuestionNav
