import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfPage } from './PdfPage';
import { ToolBar } from './ToolBar';
import { CommentPopup } from './CommentPopup';
import { TextInputPopup } from './TextInputPopup';
import { useAnnotations } from '../hooks/useAnnotations';
import { PDFAnnotatorProps, Annotation, AnnotationMode, Point, AnnotationType, TagInterface, CategoryItem, CustomCategory } from '../types';
import { AnnotationDetails } from './AnnotationDetails';
import { annotationsToJSON } from '../utils';

// Define a ref type for exposing methods
export interface PdfAnnotatorRef {
  getAnnotationsJSON: () => string;
  selectAnnotationById: (annotationId: string) => boolean; // Returns true if the annotation was found and selected
}

export const PdfAnnotator = forwardRef<PdfAnnotatorRef, PDFAnnotatorProps>(({
  url,
  annotations = [],
  scale: initialScale = 1.0,
  pageNumber = 1,
  onDocumentLoadSuccess,
  onPageChange,
  annotationMode = AnnotationMode.NONE,
  onAnnotationModeChange,
  currentCategory,
  onCategoryChange,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationDelete,
  onAnnotationSelect,
  onAnnotationsChange,
  highlightColor,
  underlineColor,
  strikeoutColor,
  rectangleColor,
  drawingColor,
  textColor,
  commentColor,
  pinColor = 'rgba(249, 115, 22, 0.7)', // Default orange
  customCategories = [],
  pdfWorkerSrc,
  fitToWidth = true, // New prop to control whether to fit to width
  defaultThickness,
  viewOnly = false, // New prop to control whether the component is in view-only mode
}, ref) => {
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(pageNumber);
  const [scale, setScale] = useState<number>(initialScale);
  const [originalPageWidth, setOriginalPageWidth] = useState<number | null>(null);
  const [showCommentPopup, setShowCommentPopup] = useState<boolean>(false);
  const [commentPosition, setCommentPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showTextPopup, setShowTextPopup] = useState<boolean>(false);
  const [textPosition, setTextPosition] = useState<Point>({ x: 0, y: 0 });
  const [textPageIndex, setTextPageIndex] = useState<number>(0);
  const [showPinPopup, setShowPinPopup] = useState<boolean>(false);
  const [pinPosition, setPinPosition] = useState<Point>({ x: 0, y: 0 });
  const [pinPageIndex, setPinPageIndex] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | undefined>(currentCategory);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedAnnotationPosition, setSelectedAnnotationPosition] = useState<{ x: number, y: number } | null>(null);
  const [isNewAnnotation, setIsNewAnnotation] = useState(false);
  const [lastMousePosition, setLastMousePosition] = useState<{ x: number, y: number } | null>(null);
  const [annotationThickness, setAnnotationThickness] = useState<number>(
    typeof defaultThickness === 'number' ? defaultThickness : 2
  );
  
  // Configure the PDF worker
  useEffect(() => {
    // Use the provided worker source or default to a CDN with HTTPS
    const workerSrc = pdfWorkerSrc || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }, [pdfWorkerSrc]);
  
  // Calculate the scale factor needed to fit the PDF to the container width
  const calculateFitToWidthScale = async (pdfDoc: pdfjsLib.PDFDocumentProxy) => {
    if (!containerRef.current) return initialScale;
    
    try {
      // Get the first page to determine dimensions
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 }); // Get original size
      
      // Store the original page width
      setOriginalPageWidth(viewport.width);
      
      // Calculate container width (accounting for padding)
      const containerWidth = containerRef.current.clientWidth - 40; // 40px for padding (20px on each side)
      
      // Calculate scale needed to fit the page width to the container
      const scaleFactor = containerWidth / viewport.width;
      
      return scaleFactor;
    } catch (error) {
      console.error('Error calculating fit-to-width scale:', error);
      return initialScale;
    }
  };
  
  // Modified onAnnotationCreate to capture the position when a new annotation is created
  const handleAnnotationCreate = (newAnnotation: Annotation) => {
    // Don't select annotation in view-only mode
    if (!viewOnly) {
      // Select the new annotation to display details
      selectAnnotation(newAnnotation);
      
      // Set position for the details dialog to last mouse position
      if (lastMousePosition) {
        setSelectedAnnotationPosition(lastMousePosition);
      }
      
      // Set isNewAnnotation flag to true so details opens in edit mode
      setIsNewAnnotation(true);
    }
    
    // Call the original onAnnotationCreate callback
    if (onAnnotationCreate) {
      onAnnotationCreate(newAnnotation);
    }
  };
  
  // Extract the competencia property from each CustomCategory for the ToolBar
  const categoryItems: CategoryItem[] = customCategories.map(cat => cat.competencia);
  
  const {
    annotations: localAnnotations,
    selectedAnnotation,
    currentMode,
    drawingPoints,
    isDrawing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    selectAnnotation,
    setMode,
  } = useAnnotations({
    initialAnnotations: annotations,
    annotationMode,
    currentCategory: selectedCategory,
    onAnnotationCreate: (newAnnotation) => {
      handleAnnotationCreate(newAnnotation);
      
      // Call the onAnnotationsChange callback with the updated annotations array
      if (onAnnotationsChange) {
        onAnnotationsChange([...localAnnotations, newAnnotation]);
      }
    },
    onAnnotationUpdate: (updatedAnnotation) => {
      if (onAnnotationUpdate) {
        onAnnotationUpdate(updatedAnnotation);
      }
      
      // Call the onAnnotationsChange callback with the updated annotations array
      if (onAnnotationsChange) {
        const updatedAnnotations = localAnnotations.map(ann => 
          ann.id === updatedAnnotation.id ? updatedAnnotation : ann
        );
        onAnnotationsChange(updatedAnnotations);
      }
    },
    onAnnotationDelete: (annotationId) => {
      if (onAnnotationDelete) {
        onAnnotationDelete(annotationId);
      }
      
      // Call the onAnnotationsChange callback with the updated annotations array
      if (onAnnotationsChange) {
        const updatedAnnotations = localAnnotations.filter(ann => ann.id !== annotationId);
        onAnnotationsChange(updatedAnnotations);
      }
    },
    onAnnotationSelect,
    highlightColor,
    underlineColor,
    strikeoutColor,
    rectangleColor,
    drawingColor,
    textColor,
    commentColor,
    pinColor,
    customCategories: categoryItems,
    thickness: annotationThickness,
  });

  // Track mouse position for all pointer events
  const trackMousePosition = (e: MouseEvent) => {
    setLastMousePosition({ x: e.clientX, y: e.clientY });
  };
  
  // Add event listener to track mouse position
  useEffect(() => {
    document.addEventListener('mousemove', trackMousePosition);
    return () => {
      document.removeEventListener('mousemove', trackMousePosition);
    };
  }, []);

  // Reset isNewAnnotation when selectedAnnotation changes
  useEffect(() => {
    if (!selectedAnnotation) {
      setIsNewAnnotation(false);
    }
  }, [selectedAnnotation]);

  // Add event listeners to handle closing the dialog on scroll and clicks outside annotations
  useEffect(() => {
    // Reference to the container element for scroll handling
    const container = containerRef.current;
    
    // Handler to close the annotation details when scrolling
    const handleScroll = () => {
      if (selectedAnnotation) {
        selectAnnotation(null);
      }
    };
    
    // Handler to close annotation details when clicking outside annotations and the dialog
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if we're in any annotation mode other than selection
      if (currentMode !== AnnotationMode.NONE) return;
      
      // Check if click is inside the annotation details dialog
      const detailsDialog = document.querySelector('.annotation-details, [data-testid="annotation-details-dialog"]');
      if (detailsDialog && detailsDialog.contains(event.target as Node)) {
        return;
      }
      
      // Check if click is on an annotation
      const isAnnotationClick = event.target && (
        (event.target as Element).closest('.annotation') || 
        (event.target as Element).classList.contains('annotation')
      );
      
      // If not clicking on annotation or dialog, close the details
      if (!isAnnotationClick && selectedAnnotation) {
        selectAnnotation(null);
      }
    };
    
    // We need a smaller timeout to let the selection events complete before we start listening for outside clicks
    // This prevents the click handler from immediately closing a newly opened dialog
    let clickListener: ((event: MouseEvent) => void) | null = null;
    
    if (selectedAnnotation) {
      // Only add click listener when there's a selected annotation
      // And do it after a small delay to prevent immediate closing
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        clickListener = handleClickOutside;
      }, 300);
      
      // Add scroll listener immediately
      if (container) {
        container.addEventListener('scroll', handleScroll);
      }
      
      // Clean up both the timeout and any added listeners
      return () => {
        clearTimeout(timeoutId);
        if (container) {
          container.removeEventListener('scroll', handleScroll);
        }
        if (clickListener) {
          document.removeEventListener('click', clickListener);
        }
      };
    } else {
      // Clean up any existing listeners when there's no selected annotation
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
      if (clickListener) {
        document.removeEventListener('click', clickListener);
      }
      return () => {};
    }
  }, [selectedAnnotation, selectAnnotation, currentMode]);

  // Expose the getAnnotationsJSON method via ref
  useImperativeHandle(ref, () => ({
    getAnnotationsJSON: () => annotationsToJSON(localAnnotations),
    selectAnnotationById: (annotationId: string) => {
      // Find the annotation by ID
      const annotation = localAnnotations.find(ann => ann.id === annotationId);
      
      if (annotation) {
        // If we have the annotation, select it
        selectAnnotation(annotation);
        
        // Scroll to the page containing this annotation if needed
        if (annotation.pageIndex + 1 !== currentPage) {
          handlePageChange(annotation.pageIndex + 1);
        }
        
        // Set position for the details dialog based on the annotation's position
        // Find the page container where the annotation is rendered
        const pageContainer = document.querySelector(`[data-page-number="${annotation.pageIndex + 1}"]`);
        
        if (pageContainer) {
          // If we found the page container, calculate position based on annotation coordinates
          const rect = pageContainer.getBoundingClientRect();
          // Calculate the actual position of the annotation on screen
          const annotationX = rect.left + (annotation.rect.x * scale);
          const annotationY = rect.top + (annotation.rect.y * scale);
          
          // Position the dialog at 20% from the top left of the annotation
          setSelectedAnnotationPosition({
            x: annotationX + (annotation.rect.width * scale * 0.2),
            y: annotationY + (annotation.rect.height * scale * 0.2)
          });
        } else {
          // If we can't find the page container yet (e.g., page not rendered), 
          // use a more reliable fallback: center the dialog in the viewport
          // This ensures the dialog is always visible even if page isn't rendered yet
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          setSelectedAnnotationPosition({
            x: viewportWidth * 0.4, // 40% from left
            y: viewportHeight * 0.3  // 30% from top
          });
          
          // When the page becomes available (after scrolling), update the position
          // Schedule a position update after a short delay to allow rendering
          setTimeout(() => {
            const pageContainer = document.querySelector(`[data-page-number="${annotation.pageIndex + 1}"]`);
            if (pageContainer) {
              const rect = pageContainer.getBoundingClientRect();
              const annotationX = rect.left + (annotation.rect.x * scale);
              const annotationY = rect.top + (annotation.rect.y * scale);
              
              setSelectedAnnotationPosition({
                x: annotationX + (annotation.rect.width * scale * 0.2),
                y: annotationY + (annotation.rect.height * scale * 0.2)
              });
            }
          }, 300); // Short delay to allow page to render
        }
        
        return true;
      }
      
      return false;
    }
  }));

  useEffect(() => {
    const loadDocument = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdfDoc = await loadingTask.promise;
        
        setPdfDocument(pdfDoc);
        setNumPages(pdfDoc.numPages);
        
        // If fitToWidth is enabled, calculate and set the appropriate scale
        if (fitToWidth) {
          const fitScale = await calculateFitToWidthScale(pdfDoc);
          setScale(fitScale);
        }
        
        if (onDocumentLoadSuccess) {
          onDocumentLoadSuccess(pdfDoc.numPages);
        }
      } catch (error) {
        console.error('Error loading PDF document:', error);
      }
    };

    loadDocument();
  }, [url, onDocumentLoadSuccess, fitToWidth, initialScale]);

  // Recalculate scale when window is resized
  useEffect(() => {
    const handleResize = async () => {
      if (fitToWidth && pdfDocument && originalPageWidth && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 40; // 40px for padding
        const newScale = containerWidth / originalPageWidth;
        setScale(newScale);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [fitToWidth, pdfDocument, originalPageWidth]);

  useEffect(() => {
    setMode(annotationMode);
  }, [annotationMode, setMode]);

  useEffect(() => {
    setSelectedCategory(currentCategory);
  }, [currentCategory]);

  // When the annotation mode changes or we deselect an annotation, reset the position
  useEffect(() => {
    if (currentMode !== AnnotationMode.NONE || !selectedAnnotation) {
      setSelectedAnnotationPosition(null);
    }
  }, [currentMode, selectedAnnotation]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= numPages) {
      setCurrentPage(newPage);
      
      if (onPageChange) {
        onPageChange(newPage);
      }
    }
  };

  const handleAnnotationModeChange = (mode: AnnotationMode) => {
    if (!viewOnly) {
      setMode(mode);
      
      if (onAnnotationModeChange) {
        onAnnotationModeChange(mode);
      }
    }
  };

  const handleCategoryChange = (category: CategoryItem | undefined) => {
    if (!viewOnly) {
      setSelectedCategory(category);
      
      if (onCategoryChange) {
        onCategoryChange(category);
      }
    }
  };

  const handleAnnotationClick = (annotation: Annotation, event?: React.MouseEvent) => {
    // If we have a click event, it means the annotation was clicked directly in the PDF view
    // so we should set the position for the detail dialog
    if (event && currentMode === AnnotationMode.NONE) {
      setSelectedAnnotationPosition({ x: event.clientX, y: event.clientY });
    } else {
      // If we don't have an event, the annotation was likely not clicked directly
      // so we don't set a position, which will prevent the dialog from opening
      setSelectedAnnotationPosition(null);
    }
    
    selectAnnotation(annotation);
  };

  const handleAnnotationUpdate = (id: string, updates: Partial<Annotation>) => {
    if (!viewOnly) {
      updateAnnotation(id, updates);
      
      // Reset isNewAnnotation flag after an update
      setIsNewAnnotation(false);
    }
  };

  const handleCommentSubmit = (content: string) => {
    if (showCommentPopup && selectedAnnotation) {
      handleAnnotationUpdate(selectedAnnotation.id, { content });
      setShowCommentPopup(false);
    }
  };

  const handleAddComment = (point: Point, pageIndex: number) => {
    // point is already in unscaled coordinates thanks to the updated getRelativeCoordinates
    // but the popup needs to appear at the scaled position on screen
    setCommentPosition({
      x: point.x * scale,
      y: point.y * scale
    });
    setShowCommentPopup(true);
  };

  // Handle adding text annotations
  const handleTextClick = (point: Point, pageIndex: number) => {
    if (currentMode === AnnotationMode.TEXT) {
      // Store the original unscaled position for annotation creation
      setTextPosition(point);
      setTextPageIndex(pageIndex);
      setShowTextPopup(true);
    }
  };

  const handleTextSubmit = (text: string) => {
    if (showTextPopup) {
      // Create a rectangle for the text - no need to adjust for scale here
      // since getRelativeCoordinates already adjusts for scale
      const rect = {
        x: textPosition.x,
        y: textPosition.y,
        width: 200, // Default width
        height: 100, // Default height
        pageIndex: textPageIndex,
      };
      
      // Get the color based on the current category
      const textAnnotationColor = getAnnotationTypeColor(AnnotationType.TEXT);
      
      // Create the text annotation with the appropriate color
      const newAnnotation = createAnnotation(AnnotationType.TEXT, rect, text);
      
      // Update the annotation with the correct color if needed
      if (newAnnotation.color !== textAnnotationColor) {
        updateAnnotation(newAnnotation.id, { color: textAnnotationColor });
      }
      
      // Set position for the details dialog
      if (lastMousePosition) {
        setSelectedAnnotationPosition(lastMousePosition);
      }
      
      // Set isNewAnnotation flag to true so details opens in edit mode
      setIsNewAnnotation(true);
      
      setShowTextPopup(false);
    }
  };

  const handleTextCancel = () => {
    setShowTextPopup(false);
  };

  // Handle adding pin annotations
  const handlePinClick = (point: Point, pageIndex: number) => {
    if (currentMode === AnnotationMode.PIN) {
      // Store the original unscaled position for annotation creation
      setPinPosition(point);
      setPinPageIndex(pageIndex);
      setShowPinPopup(true);
    }
  };

  const handlePinSubmit = (selectedTags: TagInterface[], content?: string) => {
    if (showPinPopup) {
      // Create a rectangle for the pin (pins are just points)
      // No need to adjust for scale here since getRelativeCoordinates already adjusts for scale
      const rect = {
        x: pinPosition.x,
        y: pinPosition.y,
        width: 24, // Width for clickable area
        height: 24, // Height for clickable area
        pageIndex: pinPageIndex,
      };
      
      // Create the pin annotation
      const newAnnotation = createAnnotation(AnnotationType.PIN, rect, content || '');
      
      // Update the annotation with tags and color
      updateAnnotation(newAnnotation.id, {
        tags: selectedTags,
      });
      
      // Set position for the details dialog
      if (lastMousePosition) {
        setSelectedAnnotationPosition(lastMousePosition);
      }
      
      // Set isNewAnnotation flag to true so details opens in edit mode
      setIsNewAnnotation(true);
      
      setShowPinPopup(false);
    }
  };

  const handlePinCancel = () => {
    setShowPinPopup(false);
  };

  const handleScaleChange = (newScale: number) => {
    setScale(newScale);
  };
  
  const handleFitToWidth = () => {
    if (pdfDocument && originalPageWidth && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 40; // 40px for padding
      const newScale = containerWidth / originalPageWidth;
      setScale(newScale);
    }
  };
  
  const handleThicknessChange = (thickness: number) => {
    setAnnotationThickness(thickness);
  };

  const renderPages = () => {
    if (!pdfDocument) return null;

    // Filter annotations by category if a category is selected
    const filteredAnnotations = selectedCategory 
      ? localAnnotations.filter(a => a.category?.category === selectedCategory.category)
      : localAnnotations;

    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      if (i === currentPage || i === currentPage - 1 || i === currentPage + 1) {
        pages.push(
          <PdfPage
            key={i}
            pdfDocument={pdfDocument}
            pageNumber={i}
            scale={scale}
            annotations={filteredAnnotations.filter(a => a.pageIndex === i - 1)}
            onAnnotationClick={handleAnnotationClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onCommentAdd={handleAddComment}
            onTextClick={handleTextClick}
            activeDrawingPoints={drawingPoints}
            isDrawing={isDrawing}
            drawingColor={drawingColor}
            selectedAnnotation={selectedAnnotation}
            currentMode={currentMode}
          />
        );
      }
    }
    return pages;
  };

  // Helper function to get the color for a specific annotation type
  const getAnnotationTypeColor = (type: AnnotationType): string => {
    // If we have a selected category, use its color
    if (selectedCategory) {
      return selectedCategory.color;
    }
    
    // Otherwise use the default color based on annotation type
    switch (type) {
      case AnnotationType.HIGHLIGHT:
        return highlightColor || 'rgba(255, 255, 0, 0.3)';
      case AnnotationType.UNDERLINE:
        return underlineColor || 'rgba(0, 100, 255, 0.7)';
      case AnnotationType.STRIKEOUT:
        return strikeoutColor || 'rgba(255, 0, 0, 0.5)';
      case AnnotationType.RECTANGLE:
        return rectangleColor || 'rgba(255, 0, 0, 0.3)';
      case AnnotationType.DRAWING:
        return drawingColor || 'rgba(255, 0, 0, 0.7)';
      case AnnotationType.TEXT:
        return textColor || 'rgba(0, 0, 0, 1)';
      case AnnotationType.COMMENT:
        return commentColor || 'rgba(255, 255, 0, 0.7)';
      case AnnotationType.PIN:
        return pinColor;
      default:
        return 'rgba(0, 0, 0, 1)';
    }
  };

  return (
    <div className="pdf-annotator bg-gray-100 min-h-screen relative">
      <div className="sticky top-0 z-10 shadow-md bg-white">
        <ToolBar
          currentMode={currentMode}
          onModeChange={handleAnnotationModeChange}
          currentPage={currentPage}
          numPages={numPages}
          onPageChange={handlePageChange}
          currentCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
          customCategories={categoryItems}
          scale={scale}
          onScaleChange={handleScaleChange}
          onFitToWidth={handleFitToWidth}
          currentThickness={annotationThickness}
          onThicknessChange={handleThicknessChange}
          viewOnly={viewOnly}
        />
      </div>
      
      <div className="overflow-auto p-4 flex flex-col items-center" ref={containerRef}>
        {renderPages()}
      </div>

      {/* Annotation Details Panel when an annotation is selected */}
      {selectedAnnotation && (
        <AnnotationDetails
          key={`annotation-details-${selectedAnnotation.id}`}
          annotation={selectedAnnotation}
          onClose={() => selectAnnotation(null)}
          onUpdate={handleAnnotationUpdate}
          onDelete={deleteAnnotation}
          position={selectedAnnotationPosition || undefined}
          isNew={isNewAnnotation}
          customCategories={customCategories}
          viewOnly={viewOnly}
          onAnnotationsChange={onAnnotationsChange}
        />
      )}

      {/* Comment Popup */}
      {showCommentPopup && (
        <CommentPopup
          position={commentPosition}
          onSubmit={handleCommentSubmit}
          onCancel={() => setShowCommentPopup(false)}
        />
      )}

      {/* Text Input Popup */}
      {showTextPopup && (
        <TextInputPopup
          position={{
            x: textPosition.x * scale,
            y: textPosition.y * scale
          }}
          onSubmit={handleTextSubmit}
          onCancel={handleTextCancel}
        />
      )}

      {/* Pin Popup */}
      {/* TODO: Add Pin Popup */}
    </div>
  );
});

// Helper function for getting annotations JSON without ref
export const getAnnotationsJSON = (annotations: Annotation[]): string => {
  return annotationsToJSON(annotations);
}; 