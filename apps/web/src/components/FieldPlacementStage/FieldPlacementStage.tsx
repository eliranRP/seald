import { PdfPageView } from '@/components/PdfPageView';
import {
  canvasHeightForPage,
  pageCanvasHeight,
  placeSignerField,
  usePageCanvasHeights,
} from '@/lib/canvas-coords';
import type { FieldPlacementStageProps } from './FieldPlacementStage.types';
import { Box, Page, Stack } from './FieldPlacementStage.styles';

/**
 * Read-only pages with field boxes in displayed-page fractions.
 * Preview (before send) and the signed-document view both use this so
 * they share the signing screen's per-page viewport math.
 */
export function FieldPlacementStage(props: FieldPlacementStageProps) {
  const { pdfDoc, canvasWidth, fields, surface, placementVersion = 2 } = props;
  const pageHeights = usePageCanvasHeights(pdfDoc, canvasWidth);
  const totalPages = pdfDoc.numPages;

  return (
    <Stack>
      {Array.from({ length: totalPages }, (_, index) => {
        const pageNum = index + 1;
        const measured = canvasHeightForPage(pageHeights, pageNum, placementVersion);
        const pageHeight = measured ?? pageCanvasHeight(612, 792, canvasWidth);
        const pageFields = fields.filter((field) => field.page === pageNum);
        return (
          <Page
            key={pageNum}
            data-surface={surface}
            data-page={pageNum}
            style={{ width: canvasWidth, height: pageHeight }}
          >
            <PdfPageView doc={pdfDoc} pageNumber={pageNum} width={canvasWidth} />
            {pageFields.map((field) => {
              const placed = placeSignerField(
                field,
                { w: field.width * canvasWidth, h: field.height * pageHeight },
                canvasWidth,
                pageHeight,
              );
              return (
                <Box
                  key={field.id}
                  data-field-kind={field.kind}
                  data-field-id={field.id}
                  style={{
                    left: placed.x,
                    top: placed.y,
                    width: placed.w,
                    height: placed.h,
                  }}
                >
                  {field.kind}
                </Box>
              );
            })}
          </Page>
        );
      })}
    </Stack>
  );
}
