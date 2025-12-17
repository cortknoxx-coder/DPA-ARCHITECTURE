
import { Component, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { REPO_STRUCTURE, Directory, CodeFile } from './data/firmware-files';
import { SyntaxPipe } from './pipes/syntax.pipe';

interface LintProblem {
  file: CodeFile;
  line: number;
  message: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, SyntaxPipe],
  templateUrl: './app.component.html',
  styleUrls: []
})
export class AppComponent {
  structure = signal<Directory[]>(REPO_STRUCTURE);
  activeFile = signal<CodeFile | null>(null);
  
  // Search State
  searchQuery = signal('');

  // Terminal State
  isTerminalOpen = signal(true);
  activeTerminalTab: WritableSignal<'terminal' | 'problems' | 'memory'> = signal('terminal');
  
  // Build State
  isBuilding = signal(false);
  buildProgress = signal(0);
  terminalLogs = signal<string[]>([
    'Welcome to DPA Firmware Studio v9.0',
    'ESP-IDF v5.1 environment ready.',
    'Ready for production hardening analysis.',
    '$ _'
  ]);
  
  // Linting State
  isLinting = signal(false);
  lintProblems = signal<LintProblem[]>([]);

  // Memory State
  memoryStats = signal<{dramUsed: number, dramTotal: number, iramUsed: number, iramTotal: number} | null>(null);

  // Derived state for line numbers
  lineNumbers = computed(() => {
    const file = this.activeFile();
    if (!file) return [];
    const count = file.content.split('\n').length;
    return Array.from({ length: count }, (_, i) => i + 1);
  });
  
  // Derived state for filtered file structure
  filteredStructure = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) {
      return this.structure();
    }
    
    const filter = (dirs: Directory[]): Directory[] => {
      return dirs.reduce((acc, dir) => {
        const matchingFiles = dir.files.filter(f => f.name.toLowerCase().includes(query));
        const filteredSubDirs = dir.directories ? filter(dir.directories) : [];
        
        if (matchingFiles.length > 0 || filteredSubDirs.length > 0) {
          acc.push({ ...dir, files: matchingFiles, directories: filteredSubDirs, isOpen: true });
        }
        return acc;
      }, [] as Directory[]);
    };
    
    return filter(this.structure());
  });


  toggleDir(dir: Directory) {
    dir.isOpen = !dir.isOpen;
    this.structure.update(s => [...s]); // Force update
  }

  selectFile(file: CodeFile, line?: number) {
    this.activeFile.set(file);
    // Future enhancement: scroll to line
  }
  
  navigateToProblem(problem: LintProblem) {
    this.selectFile(problem.file, problem.line);
  }

  toggleTerminal() {
    this.isTerminalOpen.update(v => !v);
  }

  async runBuild() {
    if (this.isBuilding()) return;
    
    this.isBuilding.set(true);
    this.isTerminalOpen.set(true);
    this.activeTerminalTab.set('terminal');
    this.terminalLogs.set(['$ idf.py build']);
    this.buildProgress.set(5);
    this.memoryStats.set(null);

    const steps = [
      { msg: '[1/5] Scanning dependencies...', delay: 500 },
      { msg: '[2/5] Building components: dpa_core, dpa_sys, dpa_drm...', delay: 1000 },
      { msg: '      [CC] dpa_drm.c -> dpa_drm.o', delay: 400 },
      { msg: '      [CC] dpa_sys.c -> dpa_sys.o', delay: 400 },
      { msg: '[3/5] Linking objects...', delay: 800 },
      { msg: '[4/5] Generating memory map...', delay: 500 },
      { msg: '      DRAM: [====      ] 44% (142336/327680 bytes)', delay: 200 },
      { msg: '      IRAM: [=======   ] 76% (98304/131072 bytes)', delay: 200 },
      { msg: '[5/5] Generating binary: build/dpa-firmware.bin', delay: 600 },
      { msg: '-----------------------------------------------------------------', delay: 100 },
      { msg: '✅ Build complete. 0 Errors, 0 Warnings.', delay: 100 },
      { msg: '$ _', delay: 100 }
    ];

    for (const step of steps) {
      await new Promise(r => setTimeout(r, step.delay));
      this.terminalLogs.update(logs => [...logs.slice(0, -1), step.msg, '$ _']);
      this.buildProgress.update(p => Math.min(p + 15, 100));
    }
    
    this.memoryStats.set({ dramUsed: 142336, dramTotal: 327680, iramUsed: 98304, iramTotal: 131072 });
    this.isBuilding.set(false);
    this.buildProgress.set(100);
    setTimeout(() => this.buildProgress.set(0), 1000);
  }

  async runLinter() {
    if (this.isLinting()) return;

    this.isLinting.set(true);
    this.isTerminalOpen.set(true);
    this.activeTerminalTab.set('problems');
    this.lintProblems.set([]);
    
    await new Promise(r => setTimeout(r, 1500)); // Simulate analysis time

    const problems: LintProblem[] = [];
    const mainC = this.findFile('main.c');
    if (mainC) {
      problems.push({ file: mainC, line: 42, message: 'Magic Number: Use #define for delay value `3000`.' });
    }
    const otaC = this.findFile('dpa_ota.c');
    if (otaC) {
      problems.push({ file: otaC, line: 9, message: 'Security: In-line root CA is not recommended for production.' });
    }
    const playerC = this.findFile('dpa_player.c');
    if (playerC) {
      problems.push({ file: playerC, line: 26, message: 'Architecture: Audio decoder logic is missing. Current implementation pipes raw data to I2S.' });
    }


    this.lintProblems.set(problems);
    this.isLinting.set(false);
  }

  private findFile(name: string): CodeFile | undefined {
    for (const root of this.structure()) {
      if (root.directories) {
        for (const dir of root.directories) {
          const file = dir.files.find(f => f.name === name);
          if (file) return file;
        }
      }
    }
    return undefined;
  }
}
