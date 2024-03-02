import { App, normalizePath, FuzzySuggestModal, Platform, TFolder, Vault, MarkdownView, Notice, TFile } from 'obsidian';
import CreateNoteModal from './CreateNoteModal';
import { NewFileLocation } from './enums';
import { path } from './utils';

const EMPTY_TEXT = 'No existing folder found';
const PLACEHOLDER_TEXT = 'Type folder name to fuzzy find.';
const instructions = [
  { command: '↑↓', purpose: 'to navigate' },
  { command: 'Tab ↹', purpose: 'to autocomplete folder' },
  { command: '↵', purpose: 'to choose folder' },
  { command: 'esc', purpose: 'to dismiss' },
];

export default class ChooseFolderModal extends FuzzySuggestModal<TFolder> {
  mode: NewFileLocation;
  folders: TFolder[];
  chooseFolder: HTMLDivElement;
  suggestionEmpty: HTMLDivElement;
  noSuggestion: boolean;
  newDirectoryPath: string;
  inputListener: EventListener;

  constructor(app: App, mode: NewFileLocation) {
    super(app);
    this.mode = mode;
    this.init();
  }

  init() {
    const folders = new Set() as Set<TFolder>;
    const sortedFolders = [] as TFolder[];
    let leaf = this.app.workspace.getLeaf(false);
    if (leaf &&
      leaf.view instanceof MarkdownView &&
      leaf.view.file instanceof TFile &&
      leaf.view.file.parent instanceof TFolder) {
      // pre-select current folder
      folders.add(leaf.view.file.parent);
      sortedFolders.push(leaf.view.file.parent);
    }
    Vault.recurseChildren(this.app.vault.getRoot(), (file) => {
      if (file instanceof TFolder && !folders.has(file)) {
        folders.add(file);
        sortedFolders.push(file);
      }
    });
    this.folders = sortedFolders;
    this.emptyStateText = EMPTY_TEXT;
    this.setPlaceholder(PLACEHOLDER_TEXT);
    this.setInstructions(instructions);
    this.initChooseFolderItem();

    this.inputListener = this.listenInput.bind(this);
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(item: TFolder): string {
    this.noSuggestion = false;
    return item.path;
  }

  onNoSuggestion() {
    this.noSuggestion = true;
    this.newDirectoryPath = this.inputEl.value;
    this.resultContainerEl.childNodes.forEach((c) =>
      c.parentNode.removeChild(c)
    );
    this.chooseFolder.innerText = this.inputEl.value;
    this.itemInstructionMessage(
      this.chooseFolder,
      'Press ↵ or append / to create folder.'
    );
    this.resultContainerEl.appendChild(this.chooseFolder);
    this.resultContainerEl.appendChild(this.suggestionEmpty);
  }

  shouldCreateFolder(evt: MouseEvent | KeyboardEvent): boolean {
    if (this.newDirectoryPath.endsWith('/')) {
      return true;
    }
    if (evt instanceof KeyboardEvent && evt.key == 'Enter') {
      return true;
    }
    return false;
  }

  findCurrentSelect(): HTMLElement {
    return document.querySelector('.suggestion-item.is-selected');
  }

  listenInput(evt: KeyboardEvent) {
    if (evt.key == 'Tab') {
      this.inputEl.value = this.findCurrentSelect()?.innerText;
      // to disable tab selections on input
      evt.preventDefault();
    }
  }

  onOpen() {
    super.onOpen();
    this.inputEl.addEventListener('keydown', this.inputListener);
  }

  onClose() {
    this.inputEl.removeEventListener('keydown', this.inputListener);
    super.onClose();
  }

  onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent) {
    const itemDir = item.path;
    const itemName = evt.target.value.replace(itemDir, "");
    this.createNote(itemDir, itemName);
  }

  async createNote(dir : string, name : string) {
    const dirExists = await this.app.vault.adapter.exists(dir);
    if (!dirExists) {
      await this.createDirectory(dir);
    }
    const filePath = normalizePath(path.join(dir, `${name}.md`));
    try {
      const fileExists = await this.app.vault.adapter.exists(filePath);
      if (fileExists) {
        // If the file already exists, respond with error
        throw new Error(`${filePath} already exists`);
      }
      const File = await this.app.vault.create(filePath, '');
      // Create the file and open it in the active leaf
      let leaf = this.app.workspace.getLeaf(false);
      if (this.mode === NewFileLocation.NewPane) {
        leaf = this.app.workspace.splitLeafOrActive();
      } else if (this.mode === NewFileLocation.NewTab) {
        leaf = this.app.workspace.getLeaf(true);
      } else if (!leaf) {
        // default for active pane
        leaf = this.app.workspace.getLeaf(true);
      }
      await leaf.openFile(File);
    } catch (error) {
      new Notice(error.toString());
    }
  }

  private async createDirectory(dir: string): Promise<void> {
    const { vault } = this.app;
    const { adapter } = vault;
    const root = vault.getRoot().path;
    const directoryExists = await adapter.exists(dir);
    // ===============================================================
    // -> Desktop App
    // ===============================================================
    if (!Platform.isIosApp) {
      if (!directoryExists) {
        return adapter.mkdir(normalizePath(dir));
      }
    }
    // ===============================================================
    // -> Mobile App (IOS)
    // ===============================================================
    // This is a workaround for a bug in the mobile app:
    // To get the file explorer view to update correctly, we have to create
    // each directory in the path one at time.

    // Split the path into an array of sub paths
    // Note: `normalizePath` converts path separators to '/' on all platforms
    // @example '/one/two/three/' ==> ['one', 'one/two', 'one/two/three']
    // @example 'one\two\three' ==> ['one', 'one/two', 'one/two/three']
    const subPaths: string[] = normalizePath(dir)
      .split('/')
      .filter((part) => part.trim() !== '')
      .map((_, index, arr) => arr.slice(0, index + 1).join('/'));

    // Create each directory if it does not exist
    for (const subPath of subPaths) {
      const directoryExists = await adapter.exists(path.join(root, subPath));
      if (!directoryExists) {
        await adapter.mkdir(path.join(root, subPath));
      }
    }
  }

  initChooseFolderItem() {
    this.chooseFolder = document.createElement('div');
    this.chooseFolder.addClasses(['suggestion-item', 'is-selected']);
    this.suggestionEmpty = document.createElement('div');
    this.suggestionEmpty.addClass('suggestion-empty');
    this.suggestionEmpty.innerText = EMPTY_TEXT;
  }

  itemInstructionMessage(resultEl: HTMLElement, message: string) {
    resultEl.style.color = "var(--color-green)";
    const el = document.createElement('kbd');
    el.addClass('suggestion-hotkey');
    el.innerText = message;
    resultEl.appendChild(el);
  }
}
