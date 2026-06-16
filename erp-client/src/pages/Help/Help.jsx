import { useMemo, useState } from 'react';
import { Search, ChevronRight, Info, Lightbulb } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card from '../../components/shared/Card';
import Input from '../../components/ui/Input';
import { HELP_SECTIONS, HELP_SEARCH_INDEX } from '../../data/helpContent';
import styles from './Help.module.css';

export default function Help() {
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState(HELP_SECTIONS[0].id);
  const [activeTopic, setActiveTopic] = useState(HELP_SECTIONS[0].topics[0].id);

  const q = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!q) return null;
    return HELP_SEARCH_INDEX.filter(entry => entry.haystack.includes(q));
  }, [q]);

  const selectTopic = (sectionId, topicId) => {
    setActiveSection(sectionId);
    setActiveTopic(topicId);
  };

  const currentSection = HELP_SECTIONS.find(s => s.id === activeSection) ?? HELP_SECTIONS[0];
  const currentTopic = currentSection.topics.find(t => t.id === activeTopic) ?? currentSection.topics[0];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Help & Guide"
        subtitle="Step-by-step instructions for using every module in the system"
      />

      <div className={styles.searchWrap}>
        <Input
          icon={<Search size={15} />}
          placeholder="Search for a topic, e.g. 'invoice', 'payroll', 'low stock'…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.layout}>
        <Card padding={false} className={styles.navCard}>
          {searchResults ? (
            <div className={styles.navList}>
              {searchResults.length === 0 && (
                <p className={styles.noResults}>No topics match "{query}".</p>
              )}
              {searchResults.map(r => (
                <button
                  key={`${r.sectionId}-${r.topicId}`}
                  className={`${styles.topicItem} ${activeSection === r.sectionId && activeTopic === r.topicId ? styles.topicItemActive : ''}`}
                  onClick={() => selectTopic(r.sectionId, r.topicId)}
                >
                  <span className={styles.topicSection}>{r.sectionLabel}</span>
                  <span className={styles.topicTitle}>{r.title}</span>
                  <ChevronRight size={14} className={styles.topicArrow} />
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.navList}>
              {HELP_SECTIONS.map(section => (
                <div key={section.id} className={styles.sectionGroup}>
                  <div className={styles.sectionHeading}>
                    <span className={`${styles.sectionIcon} ${styles[section.color] ?? ''}`}>
                      <section.icon size={15} strokeWidth={1.75} />
                    </span>
                    <span>{section.label}</span>
                  </div>
                  {section.topics.map(topic => (
                    <button
                      key={topic.id}
                      className={`${styles.topicItem} ${activeSection === section.id && activeTopic === topic.id ? styles.topicItemActive : ''}`}
                      onClick={() => selectTopic(section.id, topic.id)}
                    >
                      <span className={styles.topicTitle}>{topic.title}</span>
                      <ChevronRight size={14} className={styles.topicArrow} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className={styles.contentCard}>
          <div className={styles.contentHeader}>
            <span className={`${styles.sectionIcon} ${styles[currentSection.color] ?? ''}`}>
              <currentSection.icon size={16} strokeWidth={1.75} />
            </span>
            <div>
              <p className={styles.contentBreadcrumb}>{currentSection.label}</p>
              <h2 className={styles.contentTitle}>{currentTopic.title}</h2>
            </div>
          </div>

          {currentTopic.what && (
            <p className={styles.contentWhat}>{currentTopic.what}</p>
          )}

          {currentTopic.steps?.length > 0 && (
            <ol className={styles.stepsList}>
              {currentTopic.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}

          {currentTopic.tips?.length > 0 && (
            <div className={styles.tipsBox}>
              <div className={styles.tipsHeading}>
                <Lightbulb size={14} strokeWidth={1.75} />
                <span>Good to know</span>
              </div>
              <ul className={styles.tipsList}>
                {currentTopic.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.footNote}>
            <Info size={13} strokeWidth={1.75} />
            <span>
              Still stuck? Use the module's own page — most actions (New, Edit, Delete, Print)
              are available from buttons at the top of each table.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
