package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"io"
	"math"
	"os"
	"strings"
	"time"
	"unicode"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

const receiptWidth = 576 // 72 mm printable area on standard 80 mm / 203 dpi paper.
const receiptMargin = 18
const receiptBottomMargin = 120                                // 15 mm of blank paper below the last line, before the final feed/cut.
const receiptCafePhones = "530011\n+99362530011\n+99364530011" // Cafe contacts supplied for the printed receipt, separate from the site's business phone.
const maxReceiptHeight = 32768

//go:embed assets/receipt-logo.jpg
var receiptLogo []byte

type receiptMetadata struct {
	CreatedAt      string `json:"createdAt"`
	CafeName       string `json:"cafeName"`
	BusinessPhone  string `json:"businessPhone"`
	BranchName     string `json:"branchName"`
	CustomerName   string `json:"customerName"`
	CustomerPhone  string `json:"customerPhone"`
	Address        string `json:"address"`
	AddressDetails string `json:"addressDetails"`
	CustomerNote   string `json:"customerNote"`
}

func receiptHeader(metadata *receiptMetadata) (string, []string, bool) {
	if metadata != nil && strings.TrimSpace(metadata.CafeName) != "" {
		if phone := strings.TrimSpace(metadata.BusinessPhone); phone != "" {
			return cleanReceiptText(metadata.CafeName), []string{cleanReceiptText(phone)}, false
		}
		return cleanReceiptText(metadata.CafeName), nil, false
	}
	return "", strings.Split(receiptCafePhones, "\n"), true
}

type receiptCanvas struct {
	y       int
	regular *opentype.Font
	bold    *opentype.Font
	faces   map[string]font.Face
	draws   []func(*image.Gray)
}

func newReceiptCanvas() (*receiptCanvas, error) {
	regular, err := opentype.Parse(goregular.TTF)
	if err != nil {
		return nil, err
	}
	bold, err := opentype.Parse(gobold.TTF)
	if err != nil {
		return nil, err
	}
	return &receiptCanvas{y: 28, regular: regular, bold: bold, faces: make(map[string]font.Face)}, nil
}

func (canvas *receiptCanvas) face(size int, bold bool) font.Face {
	key := fmt.Sprintf("%d:%t", size, bold)
	if face := canvas.faces[key]; face != nil {
		return face
	}
	parsed := canvas.regular
	if bold {
		parsed = canvas.bold
	}
	face, _ := opentype.NewFace(parsed, &opentype.FaceOptions{Size: float64(size), DPI: 72, Hinting: font.HintingFull})
	canvas.faces[key] = face
	return face
}

func cleanReceiptText(value string) string {
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return ' '
		}
		return r
	}, value)
	return strings.Join(strings.Fields(value), " ")
}

// Wrap full dish names by measured glyph width, including unbroken long words.
func receiptLines(value string, face font.Face, width int) []string {
	value = cleanReceiptText(value)
	if value == "" {
		return nil
	}
	var lines []string
	var line []rune
	for _, r := range value {
		line = append(line, r)
		if font.MeasureString(face, string(line)).Ceil() <= width {
			continue
		}
		cut := len(line) - 1
		for i := len(line) - 2; i > 0; i-- {
			if line[i] == ' ' {
				cut = i
				break
			}
		}
		if cut < 1 {
			cut = 1
		}
		lines = append(lines, strings.TrimSpace(string(line[:cut])))
		line = []rune(strings.TrimSpace(string(line[cut:])))
	}
	if len(line) > 0 {
		lines = append(lines, string(line))
	}
	return lines
}

func (canvas *receiptCanvas) text(value string, x, y, width, size int, bold bool, align string) {
	value = cleanReceiptText(value)
	face := canvas.face(size, bold)
	for size > 10 && font.MeasureString(face, value).Ceil() > width {
		size--
		face = canvas.face(size, bold)
	}
	advance := font.MeasureString(face, value).Ceil()
	if align == "center" {
		x += (width - advance) / 2
	}
	if align == "right" {
		x += width - advance
	}
	baseline := y + face.Metrics().Ascent.Ceil()
	canvas.draws = append(canvas.draws, func(dst *image.Gray) {
		drawer := font.Drawer{Dst: dst, Src: image.Black, Face: face, Dot: fixed.P(x, baseline)}
		drawer.DrawString(value)
	})
}

func (canvas *receiptCanvas) line(x1, y1, x2, y2 int) {
	canvas.draws = append(canvas.draws, func(dst *image.Gray) {
		draw.Draw(dst, image.Rect(x1, y1, x2+1, y2+1), image.Black, image.Point{}, draw.Src)
	})
}

func (canvas *receiptCanvas) paragraph(value string, size int, bold bool, align string) {
	for _, line := range receiptLines(value, canvas.face(size, bold), receiptWidth-2*receiptMargin) {
		canvas.text(line, receiptMargin, canvas.y, receiptWidth-2*receiptMargin, size, bold, align)
		canvas.y += size + 7
	}
}

func (canvas *receiptCanvas) tableRow(values []string, header bool) {
	// Number, dish, quantity, unit price, line total; totals never wrap mid-number.
	columns := []int{receiptMargin, 52, 288, 342, 434, receiptWidth - receiptMargin}
	size := 21
	if header {
		size = 18
	}
	lines := receiptLines(values[1], canvas.face(size, header), columns[2]-columns[1]-14)
	height := max(42, len(lines)*(size+6)+16)
	if header {
		height = max(height, 54)
	}
	for i, value := range values {
		left, width := columns[i]+7, columns[i+1]-columns[i]-14
		align := "center"
		if i >= 3 {
			align = "right"
		}
		if header {
			align = "center"
		}
		if header && i == 2 {
			canvas.text("Кол-", left, canvas.y+6, width, 16, true, "center")
			canvas.text("во", left, canvas.y+26, width, 16, true, "center")
			continue
		}
		if i == 1 {
			for n, line := range lines {
				canvas.text(line, left, canvas.y+8+n*(size+6), width, size, header, "left")
			}
		} else {
			canvas.text(value, left, canvas.y+8, width, size, header, align)
		}
	}
	canvas.line(columns[0], canvas.y, columns[5], canvas.y)
	for _, x := range columns {
		canvas.line(x, canvas.y, x, canvas.y+height)
	}
	canvas.y += height
	canvas.line(columns[0], canvas.y, columns[5], canvas.y)
}

func (canvas *receiptCanvas) totalRow(label, amount string, bold bool) {
	left, divider, right := receiptMargin, 420, receiptWidth-receiptMargin
	height, size := 40, 21
	if bold {
		height, size = 48, 24
	}
	canvas.text(label, left+10, canvas.y+9, divider-left-20, size, bold, "right")
	canvas.text(amount, divider+8, canvas.y+9, right-divider-16, size, bold, "right")
	for _, x := range []int{left, divider, right} {
		canvas.line(x, canvas.y, x, canvas.y+height)
	}
	canvas.y += height
	canvas.line(left, canvas.y, right, canvas.y)
}

func receiptMoney(value float64) string { return fmt.Sprintf("%.2f", value) }
func receiptLineTotal(item printItem) float64 {
	return math.Round(item.UnitPrice*100) * float64(item.Quantity) / 100
}

func renderReceipt(job printerJob) (*image.Gray, error) {
	canvas, err := newReceiptCanvas()
	if err != nil {
		return nil, err
	}
	defer func() {
		for _, face := range canvas.faces {
			_ = face.Close()
		}
	}()
	name, phones, legacyLogo := receiptHeader(job.Metadata)
	if legacyLogo {
		logo, _, decodeErr := image.Decode(bytes.NewReader(receiptLogo))
		if decodeErr != nil {
			return nil, decodeErr
		}
		const logoSize, topMargin, logoGap = 180, 8, 8
		logoLeft := (receiptWidth - logoSize) / 2
		canvas.draws = append(canvas.draws, func(dst *image.Gray) {
			xdraw.CatmullRom.Scale(dst, image.Rect(logoLeft, topMargin, logoLeft+logoSize, topMargin+logoSize), logo, logo.Bounds(), draw.Src, nil)
		})
		canvas.y = topMargin + logoSize + logoGap
	} else {
		canvas.paragraph(name, 31, true, "center")
		canvas.paragraph("Saçakly", 19, false, "center")
	}
	if len(phones) > 0 {
		canvas.paragraph("Телефон кафе", 20, false, "center")
	}
	for _, phone := range phones {
		canvas.paragraph(phone, 24, true, "center")
	}
	metadata := job.Metadata
	canvas.y += 16
	stamp := ""
	if metadata != nil && metadata.CreatedAt != "" {
		created, parseErr := time.Parse(time.RFC3339, metadata.CreatedAt)
		if parseErr != nil {
			return nil, parseErr
		}
		local := created.In(time.FixedZone("Asia/Ashgabat", 5*60*60))
		stamp = local.Format("02.01.2006   15:04")
	}
	title := fmt.Sprintf("№ %d", job.OrderNumber)
	if stamp != "" {
		title += " от " + stamp
	}
	canvas.paragraph(title, 26, true, "left")
	canvas.line(receiptMargin, canvas.y+2, receiptWidth-receiptMargin, canvas.y+2)
	canvas.y += 20
	if normalizeDocumentType(job.DocumentType) == documentTypeCancel {
		canvas.paragraph("ЗАКАЗ ОТМЕНЁН", 30, true, "center")
		canvas.paragraph(job.CancellationReason, 22, true, "left")
		canvas.y += 12
	}
	kitchen := job.CopyType == "KITCHEN"
	if kitchen {
		canvas.paragraph("КУХНЯ", 25, true, "center")
	}
	if metadata != nil {
		if metadata.BranchName != "" {
			canvas.paragraph("Филиал: "+metadata.BranchName, 21, false, "left")
		}
		if !kitchen {
			if metadata.CustomerName != "" {
				canvas.paragraph("Имя: "+metadata.CustomerName, 22, false, "left")
			}
		}
		if phone := strings.TrimSpace(metadata.CustomerPhone); phone != "" {
			canvas.paragraph("Клиент: "+phone, 25, true, "left")
		}
		canvas.paragraph(metadata.Address, 24, true, "left")
		canvas.paragraph(metadata.AddressDetails, 21, false, "left")
		if strings.TrimSpace(metadata.CustomerNote) != "" {
			canvas.paragraph("Комментарий к заказу:", 22, true, "left")
			for _, line := range strings.Split(strings.ReplaceAll(metadata.CustomerNote, "\r\n", "\n"), "\n") {
				canvas.paragraph(line, 22, false, "left")
			}
		}
	}
	if job.Summary.DeliveryAreaName != "" {
		canvas.paragraph("Район: "+job.Summary.DeliveryAreaName, 21, false, "left")
	}
	canvas.y += 20
	canvas.tableRow([]string{"№", "Наименование", "Кол-во", "Цена", "Сумма"}, true)
	var itemsTotal float64
	for index, item := range job.Items {
		amount := receiptLineTotal(item)
		itemsTotal += amount
		canvas.tableRow([]string{fmt.Sprint(index + 1), item.Name, fmt.Sprint(item.Quantity), receiptMoney(item.UnitPrice), receiptMoney(amount)}, false)
	}
	if !kitchen {
		canvas.tableRow([]string{fmt.Sprint(len(job.Items) + 1), "Доставка", "1", receiptMoney(job.Summary.DeliveryFee), receiptMoney(job.Summary.DeliveryFee)}, false)
		if job.Summary.Discount > 0 {
			canvas.totalRow("Скидка:", "−"+receiptMoney(job.Summary.Discount), false)
		}
		totalLabel := "Итого к оплате:"
		if normalizeDocumentType(job.DocumentType) == documentTypeCancel {
			totalLabel = "Сумма заказа:"
		}
		canvas.totalRow(totalLabel, receiptMoney(job.Summary.Total), true)
	} else {
		canvas.totalRow("Сумма позиций:", receiptMoney(itemsTotal), false)
		canvas.totalRow("Доставка по заказу:", receiptMoney(job.Summary.DeliveryFee), false)
		if job.Summary.Discount > 0 {
			canvas.totalRow("Скидка по заказу:", "−"+receiptMoney(job.Summary.Discount), false)
		}
		canvas.totalRow("Всего по заказу:", receiptMoney(job.Summary.Total), true)
	}
	canvas.y += 24
	if !kitchen {
		canvas.paragraph("Söwdaňyz üçin sag boluň!", 24, true, "center")
		canvas.paragraph("Işdäňiz açyk bolsun!", 24, true, "center")
	}
	canvas.y += receiptBottomMargin
	if canvas.y > maxReceiptHeight {
		return nil, errors.New("Чек превышает допустимую длину")
	}
	result := image.NewGray(image.Rect(0, 0, receiptWidth, canvas.y))
	draw.Draw(result, result.Bounds(), image.White, image.Point{}, draw.Src)
	for _, drawOp := range canvas.draws {
		drawOp(result)
	}
	for i, value := range result.Pix {
		if value < 190 {
			result.Pix[i] = 0
		} else {
			result.Pix[i] = 255
		}
	}
	return result, nil
}

// Every packet is a complete GS v 0 raster strip. Only the final packet cuts.
// J-Speed's small form limit changes transport packet size, never receipt layout.
func receiptRasterPackets(bitmap *image.Gray, maxBytes int) [][]byte {
	rowBytes := (bitmap.Bounds().Dx() + 7) / 8
	rowsPerPacket := max(1, (maxBytes-8)/rowBytes)
	packets := [][]byte{{0x1b, 0x40, 0x1b, 0x61, 0x00}}
	for y := 0; y < bitmap.Bounds().Dy(); y += rowsPerPacket {
		height := min(rowsPerPacket, bitmap.Bounds().Dy()-y)
		packet := make([]byte, 8+rowBytes*height)
		copy(packet, []byte{0x1d, 0x76, 0x30, 0, byte(rowBytes), byte(rowBytes >> 8), byte(height), byte(height >> 8)})
		for row := 0; row < height; row++ {
			for x := 0; x < bitmap.Bounds().Dx(); x++ {
				if bitmap.GrayAt(x, y+row).Y < 128 {
					packet[8+row*rowBytes+x/8] |= 0x80 >> (x % 8)
				}
			}
		}
		packets = append(packets, packet)
	}
	return append(packets, []byte{0x1b, 0x64, 0x03, 0x1d, 0x56, 0x00})
}

func writeReceiptPreview(inputPath, outputPath string, jobIndex int) error {
	input, err := os.Open(inputPath)
	if err != nil {
		return err
	}
	defer input.Close()
	var request printRequest
	decoder := json.NewDecoder(io.LimitReader(input, maxRequestBytes+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return err
	}
	if err := validatePrintRequest(request); err != nil {
		return err
	}
	if jobIndex < 0 || jobIndex >= len(request.Jobs) {
		return errors.New("Неверный номер копии для просмотра")
	}
	job := request.Jobs[jobIndex]
	job.OrderNumber, job.DocumentType = request.OrderNumber, request.DocumentType
	job.Summary, job.CancellationReason, job.Metadata = request.Summary, request.CancellationReason, request.Metadata
	bitmap, err := renderReceipt(job)
	if err != nil {
		return err
	}
	output, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer output.Close()
	return png.Encode(output, bitmap)
}
