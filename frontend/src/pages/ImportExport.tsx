import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, AlertTriangle, CheckCircle, FileSpreadsheet, RefreshCw, Table2, ChevronDown } from 'lucide-react';
import { buildApiUrl, getAuthHeaders } from '../lib/api';
import Modal from '../components/Modal';

interface ImportExportProps {
    token: string;
}

const IMPORT_FIELDS = [
    { field: 'codigo', label: 'Codigo', required: true },
    { field: 'descripcion', label: 'Descripcion', required: true },
    { field: 'categoria', label: 'Categoria', required: true },
    { field: 'marca', label: 'Marca', required: true },
    { field: 'unidad', label: 'Unidad', required: true },
    { field: 'ubicacion', label: 'Ubicacion', required: true },
    { field: 'existencia', label: 'Existencia Inicial', required: false },
    { field: 'stock_minimo', label: 'Stock Minimo', required: false },
    { field: 'estado', label: 'Estado', required: false },
    { field: 'observaciones', label: 'Observaciones', required: false },
];

interface PreviewAnalysis {
    sheet_names: string[];
    selected_sheet: string;
    total_rows: number;
    header_row: number;
    data_start_row: number;
    data_end_row: number;
    headers: string[];
    mapping: Record<string, string>;
    mapped_preview_rows: Array<Record<string, string | number>>;
    row_analysis: Array<{
        row_number: number;
        code: string;
        description: string;
        issues: string[];
        warnings: string[];
        status: 'valid' | 'warning' | 'invalid';
        can_import: boolean;
        exists: boolean;
    }>;
    summary: {
        total_rows: number;
        valid_rows: number;
        warning_rows: number;
        invalid_rows: number;
    };
    suggestions: Record<string, string>;
}

export default function ImportExport({ token }: ImportExportProps) {
    const OBSERVED_ROWS_PER_PAGE = 5;
    const [file, setFile] = useState<File | null>(null);
    const [createCats, setCreateCats] = useState(true);
    const [createBrands, setCreateBrands] = useState(true);
    const [createUnits, setCreateUnits] = useState(false);
    const [createLocs, setCreateLocs] = useState(false);
    const [analysis, setAnalysis] = useState<PreviewAnalysis | null>(null);
    const [selectedSheet, setSelectedSheet] = useState('');
    const [headerRow, setHeaderRow] = useState(1);
    const [dataStartRow, setDataStartRow] = useState(2);
    const [dataEndRow, setDataEndRow] = useState(15);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [skipInvalidRows, setSkipInvalidRows] = useState(false);
    const [overwriteExisting, setOverwriteExisting] = useState(false);

    const [previewLoading, setPreviewLoading] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errors, setErrors] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<{ [key: string]: string }>({});
    const [previewError, setPreviewError] = useState('');
    const [warningPage, setWarningPage] = useState(1);
    const [invalidPage, setInvalidPage] = useState(1);
    const [errorPage, setErrorPage] = useState(1);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const analyzeTimeoutRef = useRef<number | null>(null);
    const headers = getAuthHeaders(token);

    const mappedPreviewFields = useMemo(() => {
        if (!analysis) {
            return IMPORT_FIELDS;
        }
        return IMPORT_FIELDS.filter((field) => field.required || analysis.mapping[field.field]);
    }, [analysis]);

    const invalidPreviewRows = analysis?.row_analysis.filter((row) => row.status === 'invalid') || [];
    const warningPreviewRows = analysis?.row_analysis.filter((row) => row.status === 'warning') || [];
    const canImportWithCurrentOptions = !!analysis && (skipInvalidRows || invalidPreviewRows.length === 0);
    const warningPageCount = Math.max(1, Math.ceil(warningPreviewRows.length / OBSERVED_ROWS_PER_PAGE));
    const invalidPageCount = Math.max(1, Math.ceil(invalidPreviewRows.length / OBSERVED_ROWS_PER_PAGE));
    const errorPageCount = Math.max(1, Math.ceil(errors.length / OBSERVED_ROWS_PER_PAGE));
    const paginatedWarningRows = warningPreviewRows.slice((warningPage - 1) * OBSERVED_ROWS_PER_PAGE, warningPage * OBSERVED_ROWS_PER_PAGE);
    const paginatedInvalidRows = invalidPreviewRows.slice((invalidPage - 1) * OBSERVED_ROWS_PER_PAGE, invalidPage * OBSERVED_ROWS_PER_PAGE);
    const paginatedErrors = errors.slice((errorPage - 1) * OBSERVED_ROWS_PER_PAGE, errorPage * OBSERVED_ROWS_PER_PAGE);
    const analysisConfigKey = useMemo(() => JSON.stringify({
        fileName: file?.name || '',
        fileSize: file?.size || 0,
        createCats,
        createBrands,
        createUnits,
        createLocs,
        selectedSheet,
        headerRow,
        dataStartRow,
        dataEndRow,
        mapping,
        skipInvalidRows,
        overwriteExisting,
    }), [file, createCats, createBrands, createUnits, createLocs, selectedSheet, headerRow, dataStartRow, dataEndRow, mapping, skipInvalidRows, overwriteExisting]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
            setAnalysis(null);
            setSelectedSheet('');
            setHeaderRow(1);
            setDataStartRow(2);
            setDataEndRow(15);
            setMapping({});
            setSkipInvalidRows(false);
            setOverwriteExisting(false);
            setSuccessMsg('');
            setErrors([]);
            setSuggestions({});
            setPreviewError('');
        }
    };

    const buildRequestData = () => {
        const formData = new FormData();
        if (file) {
            formData.append('file', file);
        }
        formData.append('create_categories', createCats.toString());
        formData.append('create_brands', createBrands.toString());
        formData.append('create_units', createUnits.toString());
        formData.append('create_locations', createLocs.toString());
        if (selectedSheet) {
            formData.append('sheet_name', selectedSheet);
        }
        formData.append('header_row', headerRow.toString());
        formData.append('data_start_row', dataStartRow.toString());
        formData.append('data_end_row', dataEndRow.toString());
        formData.append('mapping', JSON.stringify(mapping));
        formData.append('skip_invalid_rows', skipInvalidRows.toString());
        formData.append('overwrite_existing', overwriteExisting.toString());
        return formData;
    };

    const handleAnalyze = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!file) {
            alert('Por favor seleccione un archivo');
            return;
        }

        setPreviewLoading(true);
        setErrors([]);
        setSuggestions({});
        setPreviewError('');
        setSuccessMsg('');

        try {
            const res = await fetch(buildApiUrl('/api/products/import_preview/'), {
                method: 'POST',
                headers,
                body: buildRequestData()
            });

            const data = await res.json();
            if (!res.ok) {
                setPreviewError(data.error || 'No fue posible analizar el archivo.');
            } else {
                setAnalysis(data);
                setSelectedSheet(data.selected_sheet || '');
                setHeaderRow(data.header_row);
                setDataStartRow(data.data_start_row);
                setDataEndRow(data.data_end_row);
                setMapping(data.mapping || {});
                setSuggestions(data.suggestions || {});
            }
        } catch (err: any) {
            setPreviewError('Error de conexión con el backend. Asegúrese de que el servidor está activo.');
        } finally {
            setPreviewLoading(false);
        }
    };

    useEffect(() => {
        if (!file) {
            return;
        }

        if (analyzeTimeoutRef.current) {
            window.clearTimeout(analyzeTimeoutRef.current);
        }

        analyzeTimeoutRef.current = window.setTimeout(() => {
            handleAnalyze();
        }, 450);

        return () => {
            if (analyzeTimeoutRef.current) {
                window.clearTimeout(analyzeTimeoutRef.current);
            }
        };
    }, [analysisConfigKey]);

    useEffect(() => {
        setWarningPage(1);
        setInvalidPage(1);
    }, [analysis?.row_analysis]);

    useEffect(() => {
        setErrorPage(1);
        setIsErrorModalOpen(errors.length > 0);
    }, [errors]);

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            alert('Por favor seleccione un archivo');
            return;
        }

        setImportLoading(true);
        setSuccessMsg('');
        setErrors([]);
        setSuggestions({});

        try {
            const res = await fetch(buildApiUrl('/api/products/import_excel/'), {
                method: 'POST',
                headers,
                body: buildRequestData()
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.errors) {
                    setErrors(data.errors);
                    if (data.suggestions) {
                        setSuggestions(data.suggestions);
                    }
                } else {
                    setErrors([data.error || 'Ocurrió un error inesperado al importar.']);
                }
            } else {
                const parts = [data.message || 'Se importó la información correctamente'];
                if (data.overwritten_count) {
                    parts.push(`Sobrescritos: ${data.overwritten_count}.`);
                }
                if (data.skipped_count) {
                    parts.push(`Omitidos: ${data.skipped_count}.`);
                }
                setSuccessMsg(parts.join(' '));
                setFile(null);
                setAnalysis(null);
            }
        } catch (err: any) {
            setErrors(['Error de conexión con el backend. Asegúrese de que el servidor está activo.']);
        } finally {
            setImportLoading(false);
        }
    };

    return (
        <div className="fade-in importer-page">
            <div>
                <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Asistente de Importación</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Cargue hojas de cálculo para migrar o agregar productos en lote con revisión previa, decisiones de importación y previsualización clara.
                </p>
            </div>

            <div className="importer-layout">
                <form onSubmit={handleImport} className="section-card importer-panel">
                    <details className="importer-step-card importer-step-card--collapsible importer-step-card--accent-1" open>
                        <summary className="importer-step-summary importer-step-summary--accent-1">
                            <h2 className="importer-step-title">
                                <FileSpreadsheet size={20} style={{ color: 'var(--primary)' }} />
                                Paso 1: Archivo y autocreación
                            </h2>
                            <ChevronDown size={18} className="importer-step-summary__icon" />
                        </summary>

                        <div className="import-dropzone" onClick={() => document.getElementById('excel-file-selector')?.click()}>
                            <Upload size={36} style={{ color: 'var(--primary)', opacity: 0.8, marginBottom: '0.75rem' }} />
                            <p className="import-dropzone__title">{file ? file.name : 'Seleccione o arrastre un archivo'}</p>
                            <p className="import-dropzone__hint">Formatos soportados: .xlsx, .xls, .csv</p>
                            <input
                                id="excel-file-selector"
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <div>
                            <h3 className="importer-section-label">Autocreación de catálogos</h3>
                            <div className="import-options-grid importer-checkbox-grid">
                                <label className="importer-check-item">
                                    <input type="checkbox" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} />
                                    Crear categorías
                                </label>
                                <label className="importer-check-item">
                                    <input type="checkbox" checked={createBrands} onChange={(e) => setCreateBrands(e.target.checked)} />
                                    Crear marcas
                                </label>
                                <label className="importer-check-item">
                                    <input type="checkbox" checked={createUnits} onChange={(e) => setCreateUnits(e.target.checked)} />
                                    Crear unidades
                                </label>
                                <label className="importer-check-item">
                                    <input type="checkbox" checked={createLocs} onChange={(e) => setCreateLocs(e.target.checked)} />
                                    Crear ubicaciones
                                </label>
                            </div>
                        </div>
                    </details>

                    {analysis && (
                        <details className="importer-step-card importer-step-card--collapsible importer-step-card--accent-2">
                            <summary className="importer-step-summary importer-step-summary--accent-2">
                                <h2 className="importer-step-title">
                                    <Table2 size={18} style={{ color: 'var(--primary)' }} />
                                    Paso 2: Hoja y rango
                                </h2>
                                <ChevronDown size={18} className="importer-step-summary__icon" />
                            </summary>

                            <div className="importer-form-grid">
                                <div className="form-group">
                                    <label className="form-label">Hoja</label>
                                    <select className="filter-select" style={{ width: '100%' }} value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
                                        {analysis.sheet_names.map((sheet) => (
                                            <option key={sheet} value={sheet}>{sheet}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Fila de encabezados</label>
                                    <input type="number" className="form-input" value={headerRow} min="1" max={analysis.total_rows} onChange={(e) => setHeaderRow(parseInt(e.target.value) || 1)} />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Fila inicial</label>
                                    <input type="number" className="form-input" value={dataStartRow} min="1" max={analysis.total_rows} onChange={(e) => setDataStartRow(parseInt(e.target.value) || 1)} />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Fila final</label>
                                    <input type="number" className="form-input" value={dataEndRow} min={dataStartRow} max={analysis.total_rows} onChange={(e) => setDataEndRow(parseInt(e.target.value) || dataStartRow)} />
                                </div>
                            </div>
                        </details>
                    )}

                    {analysis && (
                        <details className="importer-step-card importer-step-card--collapsible importer-step-card--accent-3">
                            <summary className="importer-step-summary importer-step-summary--accent-3">
                                <h2 className="importer-step-title">
                                    <RefreshCw size={18} style={{ color: 'var(--primary)' }} />
                                    Paso 3: Mapear columnas
                                </h2>
                                <ChevronDown size={18} className="importer-step-summary__icon" />
                            </summary>

                            <div className="importer-mapping-grid">
                                {IMPORT_FIELDS.map((fieldConfig) => (
                                    <div key={fieldConfig.field} className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">
                                            {fieldConfig.required ? <span>{fieldConfig.label} *</span> : fieldConfig.label}
                                        </label>
                                        <select
                                            className="filter-select"
                                            style={{ width: '100%' }}
                                            value={mapping[fieldConfig.field] || ''}
                                            onChange={(e) => setMapping((current) => ({ ...current, [fieldConfig.field]: e.target.value }))}
                                        >
                                            <option value="">{fieldConfig.required ? 'Seleccione una columna' : 'Omitir este campo'}</option>
                                            {analysis.headers.map((header) => (
                                                <option key={header} value={header}>{header}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}

                    {analysis && (
                        <details className="importer-step-card importer-step-card--collapsible importer-step-card--accent-4">
                            <summary className="importer-step-summary importer-step-summary--accent-4">
                                <h2 className="importer-step-title">
                                    <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
                                    Paso 4: Decidir cómo importar
                                </h2>
                                <ChevronDown size={18} className="importer-step-summary__icon" />
                            </summary>

                            <div className="importer-decision-grid">
                                <label className="importer-check-card">
                                    <input type="checkbox" checked={overwriteExisting} onChange={(e) => setOverwriteExisting(e.target.checked)} />
                                    <div>
                                        <strong>Sobrescribir productos existentes</strong>
                                        <span>Si el código ya existe, actualiza sus datos y ajusta existencias.</span>
                                    </div>
                                </label>

                                <label className="importer-check-card">
                                    <input type="checkbox" checked={skipInvalidRows} onChange={(e) => setSkipInvalidRows(e.target.checked)} />
                                    <div>
                                        <strong>Omitir filas con inconsistencias</strong>
                                        <span>Importa solo las filas válidas y deja fuera las inválidas.</span>
                                    </div>
                                </label>
                            </div>

                            {invalidPreviewRows.length > 0 && !skipInvalidRows && (
                                <div className="importer-inline-warning">
                                    Hay {invalidPreviewRows.length} filas con inconsistencias. Activa la opción para omitirlas o corrige el archivo y vuelve a subirlo.
                                </div>
                            )}
                        </details>
                    )}

                    <div className="importer-actions">
                        <button type="button" onClick={() => handleAnalyze()} className="btn btn-secondary" style={{ width: '100%', padding: '0.75rem' }} disabled={previewLoading || !file}>
                            {previewLoading ? 'Analizando archivo...' : analysis ? 'Reanalizar ahora' : 'Analizar archivo'}
                        </button>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '0.75rem' }}
                            disabled={importLoading || !file || !analysis || !canImportWithCurrentOptions}
                        >
                            {importLoading ? 'Importando inventario...' : 'Confirmar e importar'}
                        </button>
                    </div>

                    <div className="importer-legend">
                        <h4>Campos mapeables</h4>
                        <div className="importer-legend-note">Los obligatorios se identifican con *</div>
                        <ul className="template-fields-grid importer-legend-list">
                            {IMPORT_FIELDS.map((field) => (
                                <li key={field.field}>
                                    {field.required ? <strong>{field.field} *</strong> : field.field}
                                </li>
                            ))}
                        </ul>
                    </div>
                </form>

                <div className="section-card importer-results">
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 650 }}>Resumen, advertencias y previsualización</h2>

                    {!previewLoading && !analysis && !successMsg && errors.length === 0 && !previewError && (
                        <div className="importer-empty-state">
                            Analiza primero el archivo para elegir hoja, rango, columnas y revisar qué filas se pueden importar.
                        </div>
                    )}

                    {previewError && (
                        <div className="importer-banner importer-banner--danger">
                            {previewError}
                        </div>
                    )}

                    {analysis && (
                        <>
                            <div className="importer-summary-grid">
                                <div className="importer-summary-card">
                                    <span>Total detectado</span>
                                    <strong>{analysis.summary.total_rows}</strong>
                                </div>
                                <div className="importer-summary-card">
                                    <span>Filas válidas</span>
                                    <strong>{analysis.summary.valid_rows}</strong>
                                </div>
                                <div className="importer-summary-card importer-summary-card--warning">
                                    <span>Con advertencias</span>
                                    <strong>{analysis.summary.warning_rows}</strong>
                                </div>
                                <div className="importer-summary-card importer-summary-card--danger">
                                    <span>Inválidas</span>
                                    <strong>{analysis.summary.invalid_rows}</strong>
                                </div>
                            </div>

                            <div className="importer-meta-row">
                                <span><strong>Hoja:</strong> {analysis.selected_sheet}</span>
                                <span><strong>Rango:</strong> filas {analysis.data_start_row} a {analysis.data_end_row}</span>
                                <span><strong>Vista:</strong> columnas mapeadas</span>
                            </div>

                            {(warningPreviewRows.length > 0 || invalidPreviewRows.length > 0) && (
                                <div className="importer-preview-panel">
                                    <div className="importer-preview-header">
                                        <h3>Filas observadas</h3>
                                        <span>Se muestran primero las advertencias y después las filas inválidas.</span>
                                    </div>

                                    {warningPreviewRows.length > 0 && (
                                        <details className="importer-observed-group importer-observed-group--warning" open>
                                            <summary className="importer-observed-group__summary">
                                                <div className="importer-observed-group__title">
                                                    <ChevronDown size={16} className="importer-observed-group__icon" />
                                                    <span>Advertencias</span>
                                                </div>
                                                <strong>{warningPreviewRows.length}</strong>
                                            </summary>
                                            <div className="importer-row-analysis">
                                                {paginatedWarningRows.map((row) => (
                                                    <div key={`warning-row-${row.row_number}`} className="importer-row-card importer-row-card--warning">
                                                        <div className="importer-row-card__header">
                                                            <strong>Fila {row.row_number}</strong>
                                                            <span>{row.code || row.description || 'Sin identificar'}</span>
                                                        </div>
                                                        <ul className="importer-row-card__list">
                                                            {row.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                            {warningPageCount > 1 && (
                                                <div className="importer-pagination">
                                                    <button type="button" className="btn btn-secondary" onClick={() => setWarningPage((current) => Math.max(1, current - 1))} disabled={warningPage === 1}>
                                                        Anterior
                                                    </button>
                                                    <span>Página {warningPage} de {warningPageCount}</span>
                                                    <button type="button" className="btn btn-secondary" onClick={() => setWarningPage((current) => Math.min(warningPageCount, current + 1))} disabled={warningPage === warningPageCount}>
                                                        Siguiente
                                                    </button>
                                                </div>
                                            )}
                                        </details>
                                    )}

                                    {invalidPreviewRows.length > 0 && (
                                        <details className="importer-observed-group importer-observed-group--invalid" open>
                                            <summary className="importer-observed-group__summary">
                                                <div className="importer-observed-group__title">
                                                    <ChevronDown size={16} className="importer-observed-group__icon" />
                                                    <span>Inválidas</span>
                                                </div>
                                                <strong>{invalidPreviewRows.length}</strong>
                                            </summary>
                                            <div className="importer-row-analysis">
                                                {paginatedInvalidRows.map((row) => (
                                                    <div key={`invalid-row-${row.row_number}`} className="importer-row-card importer-row-card--invalid">
                                                        <div className="importer-row-card__header">
                                                            <strong>Fila {row.row_number}</strong>
                                                            <span>{row.code || row.description || 'Sin identificar'}</span>
                                                        </div>
                                                        <ul className="importer-row-card__list importer-row-card__list--danger">
                                                            {row.issues.map((issue) => <li key={issue}>{issue}</li>)}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                            {invalidPageCount > 1 && (
                                                <div className="importer-pagination">
                                                    <button type="button" className="btn btn-secondary" onClick={() => setInvalidPage((current) => Math.max(1, current - 1))} disabled={invalidPage === 1}>
                                                        Anterior
                                                    </button>
                                                    <span>Página {invalidPage} de {invalidPageCount}</span>
                                                    <button type="button" className="btn btn-secondary" onClick={() => setInvalidPage((current) => Math.min(invalidPageCount, current + 1))} disabled={invalidPage === invalidPageCount}>
                                                        Siguiente
                                                    </button>
                                                </div>
                                            )}
                                        </details>
                                    )}
                                </div>
                            )}

                            {Object.keys(suggestions).length > 0 && (
                                <div className="importer-suggestions">
                                    <h4>Sugerencias de corrección</h4>
                                    <ul>
                                        {Object.entries(suggestions).map(([wrong, right]) => (
                                            <li key={wrong}>
                                                <strong>{wrong}</strong> podría corresponder a <strong>{right}</strong>.
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="importer-preview-panel">
                                <div className="importer-preview-header">
                                    <h3>Previsualización de datos mapeados</h3>
                                    <span>Se muestran las primeras filas del rango seleccionado.</span>
                                </div>

                                <div className="table-container mobile-cards importer-preview-table">
                                    <table className="custom-table">
                                        <thead>
                                            <tr>
                                                {mappedPreviewFields.map((field) => (
                                                    <th key={field.field}>{field.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analysis.mapped_preview_rows.length === 0 ? (
                                                <tr>
                                                    <td className="table-row-message" colSpan={mappedPreviewFields.length}>No se detectaron filas dentro del rango seleccionado.</td>
                                                </tr>
                                            ) : (
                                                analysis.mapped_preview_rows.map((row, index) => (
                                                    <tr key={`preview-${index}`}>
                                                        {mappedPreviewFields.map((field) => (
                                                            <td key={field.field} data-label={field.label}>{String(row[field.field] || '-')}</td>
                                                        ))}
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </>
                    )}

                    {successMsg && (
                        <div className="importer-success-card">
                            <CheckCircle size={32} />
                            <strong style={{ fontSize: '1.1rem' }}>Carga exitosa</strong>
                            <p style={{ fontSize: '0.9rem' }}>{successMsg}</p>
                        </div>
                    )}

                    {errors.length > 0 && (
                        <div className="importer-banner importer-banner--danger">
                            <AlertTriangle size={18} />
                            Se encontraron {errors.length} inconsistencias. Revise el detalle en el modal de errores.
                        </div>
                    )}
                </div>
            </div>

            <Modal isOpen={isErrorModalOpen} onClose={() => setIsErrorModalOpen(false)}>
                <div className="modal-content importer-error-modal fade-in">
                    <div className="modal-header">
                        <div>
                            <h3 className="modal-title">Errores de importación</h3>
                            <p className="modal-subtitle">Revise las filas inválidas antes de volver a importar.</p>
                        </div>
                        <button className="modal-close" type="button" onClick={() => setIsErrorModalOpen(false)}>
                            ×
                        </button>
                    </div>

                    <div className="modal-body">
                        <div className="importer-banner importer-banner--danger">
                            <AlertTriangle size={18} />
                            Se encontraron {errors.length} inconsistencias. La importación no se ejecutó con la configuración actual.
                        </div>

                        <details className="importer-observed-group importer-observed-group--invalid" open>
                            <summary className="importer-observed-group__summary">
                                <div className="importer-observed-group__title">
                                    <ChevronDown size={16} className="importer-observed-group__icon" />
                                    <span>Inválidas</span>
                                </div>
                                <strong>{errors.length}</strong>
                            </summary>

                            <div className="importer-errors-list">
                                {paginatedErrors.map((err, idx) => (
                                    <div key={`${err}-${idx}`} className="importer-errors-list__item">
                                        {err}
                                    </div>
                                ))}
                            </div>

                            {errorPageCount > 1 && (
                                <div className="importer-pagination">
                                    <button type="button" className="btn btn-secondary" onClick={() => setErrorPage((current) => Math.max(1, current - 1))} disabled={errorPage === 1}>
                                        Anterior
                                    </button>
                                    <span>Página {errorPage} de {errorPageCount}</span>
                                    <button type="button" className="btn btn-secondary" onClick={() => setErrorPage((current) => Math.min(errorPageCount, current + 1))} disabled={errorPage === errorPageCount}>
                                        Siguiente
                                    </button>
                                </div>
                            )}
                        </details>

                        {Object.keys(suggestions).length > 0 && (
                            <details className="importer-observed-group importer-observed-group--warning" open>
                                <summary className="importer-observed-group__summary">
                                    <div className="importer-observed-group__title">
                                        <ChevronDown size={16} className="importer-observed-group__icon" />
                                        <span>Sugerencias</span>
                                    </div>
                                    <strong>{Object.keys(suggestions).length}</strong>
                                </summary>

                                <div className="importer-suggestions importer-suggestions--modal">
                                    <ul>
                                        {Object.entries(suggestions).map(([wrong, right]) => (
                                            <li key={wrong}>
                                                <strong>{wrong}</strong> podría corresponder a <strong>{right}</strong>.
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </details>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={() => setIsErrorModalOpen(false)}>
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
