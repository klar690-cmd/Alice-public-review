import { KeyRound, UserRound } from 'lucide-react'

import {
  canChooseProviderMethod,
  CONNECTION_METHODS,
  methodCapability,
  PROVIDER_IDS,
  providerLabel,
  type ProviderUiSelection,
  type UiMethod,
  type UiProvider,
} from '../../lib/aliceV2/providerUiOptions'
import { inspectRunRequirements } from '../../lib/aliceV2/runIntentBridge'
import { useM2T } from './messages'
import styles from './Workspace.module.css'

export function ProviderSettings({
  selection,
  onChange,
  onAccounts,
}: {
  selection: ProviderUiSelection
  onChange: (patch: { providerId?: UiProvider; method?: UiMethod }) => void
  onAccounts: () => void
}) {
  const t = useM2T(),
    capability = methodCapability(selection.providerId, selection.method),
    requirements = inspectRunRequirements(selection)
  const methodKey = {
    simulated: 'simulatedMethod',
    'local-cli': 'localCliMethod',
    'account-login': 'accountLoginMethod',
    'api-key': 'apiKeyMethod',
    'managed-cloud': 'managedCloudMethod',
  } as const
  const statusKey = {
    SIMULATED: 'simulatedStatus',
    NATIVE_QA_PENDING: 'nativeQaStatus',
    REQUIRES_INTEGRATION: 'integrationStatus',
    UNAVAILABLE: 'unavailableStatus',
  } as const
  const reasonKey = {
    simulation: 'simulationReason',
    nativeQa: 'nativeQaReason',
    claudeBlocked: 'claudeBlockedReason',
    accountApproval: 'accountApprovalReason',
    genericCli: 'genericCliReason',
    apiFuture: 'apiFutureReason',
    cloudFuture: 'cloudFutureReason',
    unsupported: 'unsupportedReason',
  } as const
  const hintId = `provider-hint-${selection.scope.nodeId}`,
    scopeId = `provider-scope-${selection.scope.nodeId}`
  return (
    <section
      className={styles.providerSettings}
      aria-label={t('provider')}
      data-provider-status={capability.status}
    >
      <strong className={styles.providerStep}>{t('providerQuestion')}</strong>
      <label>
        {t('provider')}
        <select
          aria-describedby={`${hintId} ${scopeId}`}
          value={selection.providerId}
          onChange={(e) => onChange({ providerId: e.target.value as UiProvider })}
        >
          {PROVIDER_IDS.map((provider) => (
            <option value={provider} key={provider}>
              {provider === 'fake' ? t('fake') : providerLabel(provider)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className={styles.authChoices}>
        <legend>{t('connectionQuestion')}</legend>
        <div className={styles.authChoiceGrid}>
          <button
            type="button"
            aria-label={t('accountChoice')}
            aria-pressed={selection.method === 'account-login'}
            aria-describedby={hintId}
            disabled={selection.providerId === 'fake'}
            onClick={() => onChange({ method: 'account-login' })}
          >
            <UserRound size={16} aria-hidden="true" />
            <span>
              {t('accountChoice')}
              <small>{t('methodUnavailable')}</small>
            </span>
          </button>
          <button
            type="button"
            aria-label={t('apiChoice')}
            aria-pressed={selection.method === 'api-key'}
            aria-describedby={hintId}
            disabled={selection.providerId === 'fake'}
            onClick={() => onChange({ method: 'api-key' })}
          >
            <KeyRound size={16} aria-hidden="true" />
            <span>
              {t('apiChoice')}
              <small>
                {t(
                  methodCapability(selection.providerId, 'api-key').selectable
                    ? 'apiPendingShort'
                    : 'methodUnavailable',
                )}
              </small>
            </span>
          </button>
        </div>
        <small className={styles.muted}>{t('connectionPreferenceOnly')}</small>
      </fieldset>
      <label>
        {t('connectionMethod')}
        <select
          aria-describedby={hintId}
          value={selection.method}
          onChange={(e) => onChange({ method: e.target.value as UiMethod })}
        >
          {CONNECTION_METHODS.map((method) => (
            <option
              value={method}
              key={method}
              disabled={!canChooseProviderMethod(selection.providerId, method)}
            >
              {t(methodKey[method])}
              {!methodCapability(selection.providerId, method).selectable
                ? ` · ${t('methodUnavailable')}`
                : ''}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.providerNotice} role="status" id={hintId}>
        <span className={styles.badge}>{t(statusKey[capability.status])}</span>
        <p>{t(reasonKey[capability.reason])}</p>
        {selection.method === 'account-login' && <p>{t('accountNotAvailableHere')}</p>}
        {selection.providerId === 'claude' && capability.reason !== 'claudeBlocked' && (
          <p>{t('claudeBlockedReason')}</p>
        )}
        {selection.providerId !== 'fake' && <small>{t('notConfigured')}</small>}
        {selection.providerId !== 'fake' && (
          <small className={styles.muted}>{t('accountApprovalReason')}</small>
        )}
      </div>
      <p className={styles.muted} id={scopeId}>
        {t('scopeHint')}
      </p>
      <section
        className={styles.providerNotice}
        aria-label={t('intentRequirements')}
        data-run-intent-executable={requirements.executable}
        data-run-intent-gate={requirements.gate}
      >
        <strong>{t('intentNotConnected')}</strong>
        <p>{t(selection.method === 'simulated' ? 'intentSimulation' : 'intentNativeApproval')}</p>
        <small>{t('intentGrantBudget')}</small>
        <small>{t('intentContextUnverified')}</small>
      </section>
      <label>
        {t('runtimeModel')}
        <input
          readOnly
          value={t(selection.method === 'simulated' ? 'modelSimulation' : 'modelProvider')}
        />
      </label>
      <details className={styles.providerLimits}>
        <summary>
          {t('permissionLabel')} · {t('usageLabel')}
        </summary>
        <dl>
          <dt>{t('workspaceLabel')}</dt>
          <dd>{t('workspacePreview')}</dd>
          <dt>{t('permissionLabel')}</dt>
          <dd>{t('permissionPreview')}</dd>
          <dt>{t('usageLabel')}</dt>
          <dd>{t('usagePreview')}</dd>
        </dl>
      </details>
      <small className={styles.muted}>{t('selectionOnly')}</small>
      <button type="button" className={styles.accountsShortcut} onClick={onAccounts}>
        {t('existingAccounts')}
      </button>
    </section>
  )
}
