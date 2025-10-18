import React, { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Tabs,
  Modal,
  ToastContainer,
  toastBus,
  Badge,
  Progress,
  Card,
  CardContent,
  Avatar,
  Sidebar,
  Topbar,
} from '../components/ui';

const UIDemo = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [progressValue, setProgressValue] = useState(65);

  const showToast = (type) => {
    toastBus.publish({
      message: `This is a ${type} toast!`,
      type,
    });
  };

  const tabs = [
    {
      label: 'Tab 1',
      content: (
        <div>
          <h3>Tab 1 Content</h3>
          <p>This is the content for tab 1.</p>
        </div>
      ),
    },
    {
      label: 'Tab 2',
      content: (
        <div>
          <h3>Tab 2 Content</h3>
          <p>This is the content for tab 2.</p>
        </div>
      ),
    },
    {
      label: 'Tab 3',
      content: (
        <div>
          <h3>Tab 3 Content</h3>
          <p>This is the content for tab 3.</p>
        </div>
      ),
    },
  ];

  const selectOptions = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ];

  const containerStyles = {
    backgroundColor: 'var(--color-bg)',
    minHeight: '100vh',
    color: 'var(--color-text)',
    padding: 'var(--space-6)',
  };

  const sectionStyles = {
    marginBottom: 'var(--space-8)',
  };

  const gridStyles = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 'var(--space-6)',
    marginBottom: 'var(--space-6)',
  };

  return (
    <div style={containerStyles}>
      <ToastContainer />
      
      <Sidebar isOpen={sidebarOpen}>
        <h3>Sidebar</h3>
        <p>This is a sidebar component.</p>
        <Button onClick={() => setSidebarOpen(!sidebarOpen)}>
          Toggle Sidebar
        </Button>
      </Sidebar>

      <div style={{ marginLeft: sidebarOpen ? '250px' : '0', transition: 'margin-left 0.3s ease' }}>
        <Topbar>
          <h2>UI Component Demo</h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="ghost" onClick={() => setSidebarOpen(!sidebarOpen)}>
              Toggle Sidebar
            </Button>
          </div>
        </Topbar>

        <div style={{ padding: 'var(--space-6)' }}>
          <h1>Design System Components</h1>
          <p>This page demonstrates all the UI components using the design tokens.</p>

          <div style={sectionStyles}>
            <h2>Buttons</h2>
            <div style={gridStyles}>
              <Card>
                <CardContent>
                  <h3>Button Variants</h3>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <h3>Button Sizes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <Button fullWidth>Full Width Button</Button>
                    <Button>Normal Button</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div style={sectionStyles}>
            <h2>Form Components</h2>
            <div style={gridStyles}>
              <Card>
                <CardContent>
                  <h3>Input Fields</h3>
                  <Input
                    label="Email"
                    type="email"
                    placeholder="Enter your email"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Enter your password"
                    error="This field is required"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <h3>Select Dropdown</h3>
                  <Select
                    label="Choose an option"
                    options={selectOptions}
                    value={selectValue}
                    onChange={(e) => setSelectValue(e.target.value)}
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          <div style={sectionStyles}>
            <h2>Navigation</h2>
            <Card>
              <CardContent>
                <h3>Tabs</h3>
                <Tabs tabs={tabs} />
              </CardContent>
            </Card>
          </div>

          <div style={sectionStyles}>
            <h2>Feedback Components</h2>
            <div style={gridStyles}>
              <Card>
                <CardContent>
                  <h3>Badges</h3>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <Badge variant="info">Info</Badge>
                    <Badge variant="success">Success</Badge>
                    <Badge variant="warning">Warning</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <h3>Progress Bar</h3>
                  <Progress
                    value={progressValue}
                    label="Progress"
                  />
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <Button onClick={() => setProgressValue(Math.max(0, progressValue - 10))}>
                      Decrease
                    </Button>
                    <Button onClick={() => setProgressValue(Math.min(100, progressValue + 10))}>
                      Increase
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div style={sectionStyles}>
            <h2>Interactive Components</h2>
            <div style={gridStyles}>
              <Card>
                <CardContent>
                  <h3>Modal</h3>
                  <Button onClick={() => setModalOpen(true)}>
                    Open Modal
                  </Button>
                  <Modal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    title="Example Modal"
                  >
                    <p>This is a modal dialog. You can put any content here.</p>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                      <Button variant="ghost" onClick={() => setModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => setModalOpen(false)}>
                        Confirm
                      </Button>
                    </div>
                  </Modal>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <h3>Toast Notifications</h3>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <Button onClick={() => showToast('info')}>
                      Info Toast
                    </Button>
                    <Button onClick={() => showToast('success')}>
                      Success Toast
                    </Button>
                    <Button onClick={() => showToast('warning')}>
                      Warning Toast
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div style={sectionStyles}>
            <h2>Display Components</h2>
            <div style={gridStyles}>
              <Card>
                <CardContent>
                  <h3>Avatars</h3>
                  <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                    <Avatar size="sm" alt="Small" />
                    <Avatar size="md" alt="Medium" />
                    <Avatar size="lg" alt="Large" />
                    <Avatar size="xl" alt="Extra Large" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <h3>Cards</h3>
                  <p>This content is inside a card component.</p>
                  <p>Cards provide a clean container for related content.</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div style={sectionStyles}>
            <h2>Design Token Test</h2>
            <Card>
              <CardContent>
                <h3>Token Override Test</h3>
                <p>Try changing the CSS variables in <code>src/design/tokens.css</code> to see the changes reflected across all components.</p>
                <p>For example, change <code>--color-primary</code> to see the color change across buttons, badges, and progress bars.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UIDemo;
