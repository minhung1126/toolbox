import { Check, ChevronDown, ChevronUp, Copy, Terminal } from 'lucide-react';
export default function FfmpegCommandOutput({ workflow }) {
  const {
    shellFormat,
    inputName,
    outputName,
    generatedCommand,
    copied,
    handleCopyCommand,
    showAdvanced,
    setShellFormat,
    setInputName,
    setOutputName,
    setShowAdvanced,
  } = workflow;
  return (
    <section className="glass-panel card-padding ffmpeg-output-section" aria-label="FFmpeg 命令行與複製">
      <div className="output-header-row">
        <div className="title-with-icon">
          <Terminal size={18} className="text-primary" />
          <h2>生成的 FFmpeg 命令行</h2>
        </div>

        {/* Shell dialect toggles */}
        <div className="shell-toggle-group">
          <button
            type="button"
            className={`btn btn-xs ${shellFormat === 'single' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShellFormat('single')}
          >
            單行指令
          </button>
          <button
            type="button"
            className={`btn btn-xs ${shellFormat === 'bash' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShellFormat('bash')}
          >
            Bash ( \ )
          </button>
          <button
            type="button"
            className={`btn btn-xs ${shellFormat === 'powershell' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShellFormat('powershell')}
          >
            PowerShell ( ` )
          </button>
          <button
            type="button"
            className={`btn btn-xs ${shellFormat === 'cmd' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShellFormat('cmd')}
          >
            CMD ( ^ )
          </button>
        </div>
      </div>

      {/* Filename Inputs */}
      <div className="filename-inputs-grid">
        <div className="field-group">
          <label className="field-label" htmlFor="ffmpeg-input-name">
            輸入檔名 (Input File)
            <span className="text-dim text-xs ml-2">自動雙引號防護</span>
          </label>
          <input
            id="ffmpeg-input-name"
            type="text"
            className="input-field"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            placeholder="input.mp4"
          />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="ffmpeg-output-name">
            輸出檔名 (Output File)
            <span className="text-dim text-xs ml-2">自動雙引號防護</span>
          </label>
          <input
            id="ffmpeg-output-name"
            type="text"
            className="input-field"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="output.mp4"
          />
        </div>
      </div>

      {/* Code Terminal Box */}
      <div className="command-terminal-box">
        <pre className="command-code">
          <code>{generatedCommand.activeCommand}</code>
        </pre>
        <button
          type="button"
          className={`btn btn-copy-command ${copied ? 'btn-success' : 'btn-primary'}`}
          onClick={handleCopyCommand}
          aria-label="一鍵複製命令行"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? '已複製指令！' : '一鍵複製命令行'}</span>
        </button>
      </div>

      {/* Collapsible Parameter Breakdown Table */}
      <div className="breakdown-collapsible">
        <button
          type="button"
          className="btn-collapse-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
        >
          <span>參數白話解析 ({generatedCommand.breakdown.length} 項參數)</span>
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showAdvanced && (
          <div className="breakdown-table-wrapper">
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>指令參數</th>
                  <th>作用說明</th>
                </tr>
              </thead>
              <tbody>
                {generatedCommand.breakdown.map((item, idx) => (
                  <tr key={idx}>
                    <td className="param-code">
                      <code>{item.flag}</code>
                    </td>
                    <td className="param-desc">{item.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
