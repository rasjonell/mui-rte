import * as React from 'react'
import Immutable from 'immutable'
import classNames from 'classnames'
import { createStyles, withStyles, WithStyles, Theme } from '@material-ui/core/styles'
import {
    Editor, EditorState, convertFromRaw, RichUtils, AtomicBlockUtils,
    CompositeDecorator, convertToRaw, DefaultDraftBlockRenderMap, DraftEditorCommand, 
    DraftHandleValue, DraftStyleMap, ContentBlock
} from 'draft-js'
import EditorControls, { TEditorControl, TCustomControl } from './components/EditorControls'
import Link from './components/Link'
import Image from './components/Image'
import Blockquote from './components/Blockquote'
import CodeBlock from './components/CodeBlock'
import UrlPopover from './components/UrlPopover'
import { getSelectionInfo, getCompatibleSpacing } from './utils'

const styles = ({ spacing, typography, palette }: Theme) => createStyles({
    root: {
    },
    container: {
        margin: getCompatibleSpacing(spacing, 1, 0, 0, 0),
        fontFamily: typography.body1.fontFamily,
        fontSize: typography.body1.fontSize,
        '& figure': {
            margin: 0
        }
    },
    inheritFontSize: {
        fontSize: "inherit"
    },
    editor: {
    },
    editorContainer: {
        margin: getCompatibleSpacing(spacing, 1, 0, 0, 0),
        cursor: "text",
        width: "100%",
        padding: getCompatibleSpacing(spacing, 0, 0, 1, 0)
    },
    editorReadOnly: {
        borderBottom: "none"
    },
    error: {
        borderBottom: "2px solid red"
    },
    hidePlaceholder: {
        display: "none"
    },
    placeHolder: {
        color: palette.grey[600]
    },
    linkPopover: {
        padding: getCompatibleSpacing(spacing, 2, 2, 2, 2)
    },
    linkTextField: {
        width: "100%"
    },
    anchorLink: {
        textDecoration: "underline",
        color: palette.secondary.main
    }
})

interface IMUIRichTextEditorProps extends WithStyles<typeof styles> {
    value?: any
    label?: string,
    readOnly?: boolean
    inheritFontSize?: boolean
    error?: boolean
    controls?: Array<TEditorControl>
    onSave?: (data: string) => void
    onChange?: (state: EditorState) => void
    customControls?: TCustomControl[],
    ref?: any
}

type IMUIRichTextEditorState = {
    editorState: EditorState
    focused: boolean
    anchorLinkPopover?: HTMLElement
    anchorMediaPopover?: HTMLElement
    urlValue?: string
    urlKey?: string
}

class MUIRichTextEditor extends React.Component<IMUIRichTextEditorProps, IMUIRichTextEditorState> {
    private blockRenderMap = Immutable.Map({
        'blockquote': {
            element: "blockquote",
            wrapper: <Blockquote />
        },
        'code-block': {
            element: "pre",
            wrapper: <CodeBlock />
        }
    })
    private styleRenderMap: DraftStyleMap = {
        'STRIKETROUGH': {
            textDecoration: "line-through"
        },
        'HIGHLIGHT': {
            backgroundColor: "yellow"
        }
    }
    private extendedBlockRenderMap: Immutable.Map<any, any>
    constructor(props: IMUIRichTextEditorProps) {
        super(props)
        const decorator = new CompositeDecorator([
            {
                strategy: this.findLinkEntities,
                component: Link,
            }
        ])
        let editorState = EditorState.createEmpty(decorator)
        if (this.props.value) {
            editorState = EditorState.createWithContent(convertFromRaw(JSON.parse(this.props.value)), decorator)
        }
        let customBlockRenderMap: any = {}
        if (this.props.customControls) {
            this.props.customControls.forEach(control => {
                if (control.type === "inline" && control.inlineStyle) {
                    this.styleRenderMap[control.name.toUpperCase()] = control.inlineStyle
                }
                else if (control.type === "block" && control.blockWrapper) {
                    customBlockRenderMap[control.name.toUpperCase()] = {
                        element: "div",
                        wrapper: control.blockWrapper
                    }
                }
            })
        }
        this.state = {
            editorState: editorState,
            focused: false
        }
        this.extendedBlockRenderMap = DefaultDraftBlockRenderMap.merge(this.blockRenderMap, Immutable.Map(customBlockRenderMap))
    }

    handleChange = (state: EditorState) => {
        this.setState({
            editorState: state
        })
        if (this.props.onChange) {
            this.props.onChange(state)
        }
    }

    handleClearFormat = () => {
        const { editorState } = this.state
        const selectionInfo = getSelectionInfo(editorState)
        let newEditorState = editorState
        selectionInfo.inlineStyle.forEach((effect) => {
            if (effect) {
                newEditorState = RichUtils.toggleInlineStyle(newEditorState, effect)
            }
        })
        newEditorState = RichUtils.toggleBlockType(newEditorState, selectionInfo.blockType)
        this.updateAndFocus(newEditorState)
    }

    handleFocus = () => {
        (this.refs.editor as any).focus()
        this.setState({
            focused: true
        })
    }

    handleBlur = () => {
        this.setState({
            focused: false
        })
    }

    handleCloseAnchorLinkPopover = () => {
        this.setState({
            anchorLinkPopover: undefined
        })
    }

    handleKeyCommand = (command: DraftEditorCommand, editorState: EditorState): DraftHandleValue => {
        const newState = RichUtils.handleKeyCommand(editorState, command)
        if (newState) {
            this.handleChange(newState)
            return "handled"
        }
        return "not-handled"
    }


    handleCustomClick = (style: any) => {
        if (!this.props.customControls) {
            return
        }
        for (let control of this.props.customControls) {
            if (control.name.toUpperCase() === style) {
                if (control.onClick) {
                    control.onClick(this.state.editorState, control.name)
                }
                break
            }
        }
    }

    handleUndo = () => {
        this.setState(prevState => {
            return {
                editorState: EditorState.undo(prevState.editorState)
            }
        })
    }

    handleRedo = () => {
        this.setState(prevState => {
            return {
                editorState: EditorState.redo(prevState.editorState)
            }
        })
    }

    save = () => {
        if (this.props.onSave) {
            this.props.onSave(JSON.stringify(convertToRaw(this.state.editorState.getCurrentContent())))
        }
    }

    updateAndFocus = (state: EditorState) => {
        this.setState({
            editorState: state
        }, () => {
            setTimeout(() => this.handleFocus(), 0)
        })
    }

    toggleBlockType = (blockType: any) => {
        this.updateAndFocus(
            RichUtils.toggleBlockType(
                this.state.editorState,
                blockType
            )
        )
    }

    toggleInlineStyle = (inlineStyle: any) => {
        this.updateAndFocus(
            RichUtils.toggleInlineStyle(
                this.state.editorState,
                inlineStyle
            )
        )
    }

    promptForLink = () => {
        const { editorState } = this.state
        const selection = editorState.getSelection()

        if (!selection.isCollapsed()) {
            const selectionInfo = getSelectionInfo(editorState)
            const contentState = editorState.getCurrentContent()
            const linkKey = selectionInfo.linkKey

            let url = ''
            let urlKey = undefined
            if (linkKey) {
                const linkInstance = contentState.getEntity(linkKey)
                url = linkInstance.getData().url
                urlKey = linkKey
            }
            this.setState({
                urlValue: url,
                urlKey: urlKey,
                anchorLinkPopover: document.getElementById("mui-rte-link-control")!
            }, () => {
                setTimeout(() => document.getElementById("mui-rte-link-popover")!.focus(), 0)
            })
        }
    }

    removeLink = () => {
        const { editorState } = this.state
        const selection = editorState.getSelection()
        this.updateStateForPopover(RichUtils.toggleLink(editorState, selection, null))
    }

    confirmLink = (url?: string) => {
        const { editorState, urlKey } = this.state
        if (!url) {
            if (urlKey) {
                this.removeLink()
                return
            }
            this.setState({
                anchorLinkPopover: undefined
            })
            return
        }

        const contentState = editorState.getCurrentContent()
        let replaceEditorState = null

        if (urlKey) {
            contentState.replaceEntityData(urlKey, {
                url: url
            })
            replaceEditorState = EditorState.push(editorState, contentState, "apply-entity")
        }
        else {
            const contentStateWithEntity = contentState.createEntity(
                'LINK',
                'MUTABLE',
                {
                    url: url
                }
            )

            const entityKey = contentStateWithEntity.getLastCreatedEntityKey()
            const newEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity })
            replaceEditorState = RichUtils.toggleLink(
                newEditorState,
                newEditorState.getSelection(),
                entityKey)
        }
        this.updateStateForPopover(replaceEditorState)
    }

    promptForMedia = () => {
        const { editorState } = this.state
        let url = ''
        let urlKey = undefined
        const selectionInfo = getSelectionInfo(editorState)
        const contentState = editorState.getCurrentContent()
        const linkKey = selectionInfo.linkKey

        if (linkKey) {
            const linkInstance = contentState.getEntity(linkKey)
            url = linkInstance.getData().url
            urlKey = linkKey
        }

        this.setState({
            urlValue: url,
            urlKey: urlKey,
            anchorMediaPopover: document.getElementById("mui-rte-image-control")!
        }, () => {
            setTimeout(() => document.getElementById("mui-rte-media-popover")!.focus(), 0)
        })
    }

    confirmMedia = (url?: string) => {
        const { editorState, urlKey } = this.state
        if (!url) {
            this.setState({
                anchorMediaPopover: undefined
            })
            return
        }

        const contentState = editorState.getCurrentContent()
        let replaceEditorState = null

        if (urlKey) {
            contentState.replaceEntityData(urlKey, {
                url: url
            })
            const newEditorState = EditorState.push(editorState, contentState, "apply-entity")
            replaceEditorState = EditorState.forceSelection(newEditorState, newEditorState.getCurrentContent().getSelectionAfter())
        }
        else {
            const contentStateWithEntity = contentState.createEntity(
                'IMAGE',
                'IMMUTABLE', 
                {
                    url: url
                }
            )
            const entityKey = contentStateWithEntity.getLastCreatedEntityKey()
            const newEditorStateRaw = EditorState.set(editorState, { currentContent: contentStateWithEntity})
            const newEditorState = AtomicBlockUtils.insertAtomicBlock(
                newEditorStateRaw,
                entityKey, ' ')
            replaceEditorState = EditorState.forceSelection(newEditorState, newEditorState.getCurrentContent().getSelectionAfter())
        }
        this.updateStateForPopover(replaceEditorState)
    }

    updateStateForPopover = (editorState: EditorState) => {
        this.setState({
            editorState: editorState,
            anchorLinkPopover: undefined,
            anchorMediaPopover: undefined,
            urlValue: undefined,
            urlKey: undefined
        }, () => {
            setTimeout(() => (this.refs.editor as any).blur(), 0)
            setTimeout(() => this.handleFocus(), 1)
        })
    }

    findLinkEntities(contentBlock: any, callback: any, contentState: any) {
        contentBlock.findEntityRanges(
            (character: any) => {
                const entityKey = character.getEntity()
                return (
                    entityKey !== null &&
                    contentState.getEntity(entityKey).getType() === 'LINK'
                )
            },
            callback
        )
    }

    blockRenderer = (contentBlock: ContentBlock) => {
        const blockType = contentBlock.getType()
        if (blockType === 'atomic') {
            const contentState = this.state.editorState.getCurrentContent()
            const entity = contentBlock.getEntityAt(0)
            if (entity) {
                const type = contentState.getEntity(entity).getType()
                if (type === 'IMAGE') {
                    return {
                        component: Image,
                        editable: false
                    }
                }
            }
        }
        return null
    }

    render() {
        const { classes, controls, customControls } = this.props
        const contentState = this.state.editorState.getCurrentContent()
        let className = ""
        let placeholder = null
        const editable = this.props.readOnly === undefined || !this.props.readOnly
        if (!contentState.hasText() && !this.state.focused) {
            placeholder = (
                <div
                    className={classNames(classes.editorContainer, classes.placeHolder, {
                        [classes.error]: this.props.error
                    })}
                    onClick={this.handleFocus}
                >
                    {this.props.label || ""}
                </div>
            )
            className = classes.hidePlaceholder
        }

        return (
            <div className={classes.root}>
                <div className={classNames(classes.container, {
                    [classes.inheritFontSize]: this.props.inheritFontSize
                })}>
                    {editable ?
                        <EditorControls
                            editorState={this.state.editorState}
                            onToggleBlock={this.toggleBlockType}
                            onToggleInline={this.toggleInlineStyle}
                            onPromptLink={this.promptForLink}
                            onPromptMedia={this.promptForMedia}
                            onClear={this.handleClearFormat}
                            onUndo={this.handleUndo}
                            onRedo={this.handleRedo}
                            onSave={this.save}
                            onCustomClick={this.handleCustomClick}
                            controls={controls}
                            customControls={customControls}
                        />
                        : null}
                    {placeholder}
                    <div className={classes.editor}>
                        <div className={classNames(className, classes.editorContainer, {
                            [classes.editorReadOnly]: !editable,
                            [classes.error]: this.props.error
                        })} onClick={this.handleFocus} onBlur={this.handleBlur}>
                            <Editor
                                customStyleMap={this.styleRenderMap}
                                blockRenderMap={this.extendedBlockRenderMap}
                                blockRendererFn={this.blockRenderer}
                                editorState={this.state.editorState}
                                onChange={this.handleChange}
                                readOnly={this.props.readOnly}
                                handleKeyCommand={this.handleKeyCommand}
                                ref="editor"
                            />
                        </div>
                    </div>
                    {this.state.anchorLinkPopover ?
                        <UrlPopover
                            id="mui-rte-link-popover"
                            url={this.state.urlValue}
                            anchor={this.state.anchorLinkPopover}
                            onConfirm={this.confirmLink}
                        />
                        : null}
                    {this.state.anchorMediaPopover ?
                        <UrlPopover
                            id="mui-rte-media-popover"
                            url={this.state.urlValue}
                            anchor={this.state.anchorMediaPopover}
                            onConfirm={this.confirmMedia}
                        />
                        : null}
                </div>
            </div>
        )
    }
}

export default withStyles(styles, { withTheme: true, name: "MUIRichTextEditor" })(MUIRichTextEditor)