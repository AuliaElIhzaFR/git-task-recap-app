import ExcelJS from 'exceljs';

export class ExcelService {
  async generateExcel(commits: any[], user: string, startDate: string, endDate: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Task Recap');

    // Merge title across all 6 columns (including the new Link column)
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Rekap Tugas - ${user} (${startDate} s/d ${endDate})`;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.addRow([]); // Empty row
    
    // Header Row: No | Nama Tugas | Deskripsi Tugas | Modul | Tanggal Dikerjakan | Link Commit
    const headerRow = worksheet.addRow(['No', 'Nama Tugas', 'Deskripsi Tugas', 'Modul', 'Tanggal Dikerjakan', 'Link Commit']);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.border = {
        top: {style:'thin'},
        left: {style:'thin'},
        bottom: {style:'thin'},
        right: {style:'thin'}
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Data Rows
    commits.forEach((commit, index) => {
        const titleLine = commit.title || commit.message.split('\n')[0];
        const date = new Date(commit.created_at).toLocaleDateString('id-ID', {
          day: '2-digit', month: 'long', year: 'numeric'
        });

        const row = worksheet.addRow([
            index + 1,
            titleLine,
            commit.message,
            commit.projectName || '-',
            date,
            commit.url || commit.html_url || '' // commit link
        ]);

        row.eachCell((cell, colNumber) => {
            cell.border = {
              top: {style:'thin'},
              left: {style:'thin'},
              bottom: {style:'thin'},
              right: {style:'thin'}
            };

            if (colNumber === 1) {
                // No column — center align
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            } else if (colNumber === 6) {
                // Link column — make it a hyperlink if available
                const url = commit.html_url || commit.url || '';
                if (url) {
                    cell.value = { text: 'Lihat Commit', hyperlink: url } as ExcelJS.CellHyperlinkValue;
                    cell.font = { color: { argb: 'FF1155CC' }, underline: true };
                    cell.alignment = { vertical: 'top', horizontal: 'center', wrapText: false };
                } else {
                    cell.alignment = { vertical: 'top', wrapText: false };
                }
            } else {
                cell.alignment = { vertical: 'top', wrapText: true };
            }
        });
    });

    // Configure Column widths
    worksheet.columns = [
        { width: 6  }, // No
        { width: 40 }, // Nama Tugas
        { width: 60 }, // Deskripsi Tugas
        { width: 30 }, // Modul
        { width: 20 }, // Tanggal Dikerjakan
        { width: 18 }  // Link Commit
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
