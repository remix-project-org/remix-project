import React from 'react'
import { AvailableProductsViewProps, EligibleProduct, ActiveEntitlement } from '../types'
import { BillingApiService } from '@remix-api'
import { PurchaseButton } from './purchase-button'

/**
 * Display available products returned by the API
 * The API decides what products the user can see based on eligibility rules, tags, etc.
 * The frontend just displays them - no hardcoded product filtering
 */
export const AvailableProductsView: React.FC<AvailableProductsViewProps> = ({
  products,
  loading = false,
  error = null,
  activeEntitlements = [],
  onPurchase,
  purchasing = false,
  filterType
}) => {
  if (loading) {
    return (
      <div className="d-flex justify-content-center p-4">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-warning m-3">
        <i className="fas fa-exclamation-triangle me-2"></i>
        {error}
      </div>
    )
  }

  // Apply type filter if provided
  let displayProducts = products
  if (filterType) {
    displayProducts = BillingApiService.filterByType(products, filterType)
  }

  if (!displayProducts || displayProducts.length === 0) {
    return (
      <div className="text-muted text-center p-4">
        No products available
      </div>
    )
  }

  return (
    <div className="available-products-view">
      <div className="row g-3">
        {displayProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            activeEntitlements={activeEntitlements}
            onPurchase={onPurchase}
            purchasing={purchasing}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Individual product card - adapts display based on product type
 */
const ProductCard: React.FC<{
  product: EligibleProduct
  activeEntitlements: ActiveEntitlement[]
  onPurchase: (product: EligibleProduct) => void
  purchasing: boolean
}> = ({ product, activeEntitlements, onPurchase, purchasing }) => {
  // Determine if user has access (check by product slug or feature group)
  const hasAccess = activeEntitlements.some(e => 
    e.productSlug === product.slug || 
    (product.feature_group && e.featureGroup === product.feature_group && e.status === 'active')
  )

  const activeEntitlement = activeEntitlements.find(e => 
    e.productSlug === product.slug || 
    (product.feature_group && e.featureGroup === product.feature_group && e.status === 'active')
  )

  // Check if product is free
  const isFree = BillingApiService.isProductFree(product)
  const usesFreeProvider = BillingApiService.usesFreeProvider(product)

  // Get price display
  const priceDisplay = isFree 
    ? 'Free' 
    : BillingApiService.formatPrice(product.price_cents)

  // Get billing interval for recurring products
  const billingInterval = product.billing_interval || (product.is_recurring ? 'month' : null)

  // Determine button label
  let buttonLabel = 'Buy Now'
  if (isFree) {
    buttonLabel = 'Get Free'
  } else if (product.product_type === 'subscription_plan' || product.is_recurring) {
    buttonLabel = 'Subscribe'
  }

  return (
    <div className="col-12 col-md-6 col-lg-4">
      <div className={`card h-100 ${product.is_popular ? 'border-primary' : ''} ${hasAccess ? 'border-success' : ''}`}>
        {/* Header badges */}
        {product.is_popular && !hasAccess && (
          <div className="card-header bg-primary text-white text-center py-1">
            <small><i className="fas fa-star me-1"></i>Popular</small>
          </div>
        )}
        {hasAccess && (
          <div className="card-header bg-success text-white text-center py-1">
            <small><i className="fas fa-unlock me-1"></i>Access Granted</small>
          </div>
        )}
        {isFree && !hasAccess && !product.is_popular && (
          <div className="card-header bg-info text-white text-center py-1">
            <small><i className="fas fa-gift me-1"></i>Free</small>
          </div>
        )}

        <div className="card-body d-flex flex-column">
          {/* Title and type badge */}
          <div className="d-flex justify-content-between align-items-start mb-2">
            <h5 className="card-title mb-0">{product.name}</h5>
            <ProductTypeBadge type={product.product_type} isRecurring={product.is_recurring} />
          </div>

          {/* Description */}
          {product.description && (
            <p className="card-text text-muted small mb-3">
              {product.description}
            </p>
          )}

          {/* Price */}
          <div className="mb-3">
            <span className="h4">{priceDisplay}</span>
            {billingInterval && (
              <small className="text-muted">/{billingInterval}</small>
            )}
          </div>

          {/* Type-specific details */}
          <ProductDetails product={product} />

          {/* Provider info (subtle) */}
          {usesFreeProvider && (
            <div className="mb-2">
              <small className="text-muted">
                <i className="fas fa-flask me-1"></i>
                Test purchase (no charge)
              </small>
            </div>
          )}

          {/* Purchase Button */}
          <div className="mt-auto">
            <PurchaseButton
              label={buttonLabel}
              priceId={product.external_price_id}
              onClick={() => onPurchase(product)}
              loading={purchasing}
              disabled={false}
              variant={product.is_popular ? 'primary' : 'outline'}
              requirePriceId={!isFree}
            />
            {/* Access expiry info */}
            {hasAccess && activeEntitlement?.expiresAt && (
              <small className="text-muted d-block text-center mt-1">
                <i className="fas fa-check text-success me-1"></i>
                {activeEntitlement.isRecurring ? 'Renews' : 'Access expires'}: {new Date(activeEntitlement.expiresAt).toLocaleDateString()}
              </small>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Badge showing product type
 */
const ProductTypeBadge: React.FC<{ type: string; isRecurring?: boolean }> = ({ type, isRecurring }) => {
  switch (type) {
    case 'credit_package':
      return <span className="badge bg-warning text-dark">Credits</span>
    case 'subscription_plan':
      return <span className="badge bg-info">Subscription</span>
    case 'feature_access':
      return isRecurring 
        ? <span className="badge bg-info">Subscription</span>
        : <span className="badge bg-secondary">Pass</span>
    default:
      return null
  }
}

/**
 * Type-specific product details
 */
const ProductDetails: React.FC<{ product: EligibleProduct }> = ({ product }) => {
  switch (product.product_type) {
    case 'credit_package':
      return (
        <div className="mb-3">
          <div className="d-flex align-items-center">
            <i className="fas fa-coins text-warning me-2"></i>
            <strong>{product.credits?.toLocaleString()}</strong>
            <span className="text-muted ms-1">credits</span>
          </div>
        </div>
      )

    case 'subscription_plan':
      return (
        <div className="mb-3 flex-grow-1">
          {product.credits_per_month && (
            <div className="mb-2">
              <i className="fas fa-coins text-warning me-2"></i>
              <strong>{product.credits_per_month.toLocaleString()}</strong>
              <span className="text-muted ms-1">credits/month</span>
            </div>
          )}
          {product.features && product.features.length > 0 && (
            <ul className="list-unstyled mb-0 small">
              {product.features.map((feature, idx) => (
                <li key={idx} className="mb-1">
                  <i className="fas fa-check text-success me-2"></i>
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </div>
      )

    case 'feature_access':
      return (
        <div className="mb-3 flex-grow-1">
          {/* Duration */}
          {product.duration_type && (
            <div className="mb-2">
              <i className="fas fa-clock text-muted me-2"></i>
              {BillingApiService.formatDuration(product.duration_type, product.duration_value || 1)}
              {product.is_recurring && ' (auto-renews)'}
            </div>
          )}
          {/* Feature groups */}
          {product.feature_groups && product.feature_groups.length > 0 && (
            <>
              <small className="text-muted d-block mb-2">Includes access to:</small>
              <ul className="list-unstyled mb-0">
                {product.feature_groups.map((fg) => (
                  <li key={fg.id} className="mb-1 small">
                    <i className="fas fa-check text-success me-2"></i>
                    <strong>{fg.displayName}</strong>
                    {fg.description && (
                      <span className="text-muted d-block ms-4" style={{ fontSize: '0.85em' }}>
                        {fg.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )

    default:
      return null
  }
}
